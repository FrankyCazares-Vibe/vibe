# Map 05: Campus > Chat, every link into chat, and the gates

Read Sat Oct 3, 2026 in the worktree `scratchpad/chatdesk` (branch `chat-desktop` = main `e7869b9`). Read-only. Every line number below is from that tree. Paths are relative to the repo root unless they start with `/`.

Checked against the two older notes (`handoffs/s72-prep/notes/desktop-chat.md`, `handoffs/s72-prep/desktop.md`): their line numbers for `campus-home.tsx`, `MessagesSwitch.tsx`, `ChannelsSection.tsx`, `payload.ts`, `OttoSidePanel.tsx`, `_otto.js` still hold. Three things they do not say are in section 5 (traps 1, 2, 6).

Baseline on this tree (run today): `npm test` = 1,839 tests, 0 fail, 3 s. `npm run typecheck` = exit 0, 12 s. Lint counts per file are in 4.4.

## 1. What exists

### 1.1 How phone or desktop is chosen

- `src/lib/use-is-mobile.ts:14` `MOBILE_BREAKPOINT_PX = 900`; `:16` the query is `(max-width: 899px)`; `:55` `useIsMobile(): boolean`. The server always renders desktop (`:38-40`), the phone swaps in after hydration.
- `src/app/campus/CampusSwitch.tsx:17-32`: phone = `MobileShell` + `CampusMobile`; desktop = `CampusHome`.
- `src/app/messages/MessagesSwitch.tsx:19-66`: phone = `MobileShell` + `MessagesMobile` (`:28-37`); desktop = `CampusAppShell` + an iframe of `/html/messages.html?app=1&embedded=1[&to=][&channel=]` (`:39-65`). The desktop branch never asks the flag.
- `src/app/messages/page.tsx:24-36`: server page. `enforceCampusAccess("/messages")`, then reads only `?to=` and `?channel=` and passes them as `initialHandle` (lower-cased) and `initialChannelId`. `?tab=` is not read here (the phone reads it itself).
- `src/components/campus-app-shell.tsx:33-50` `CampusAppShell({ children, sidebar? })`: `LeftNav` + children + `MobileTabBar` + `OttoCorner`. The Otto orb is hidden on any path starting `/messages` (`:35`).

### 1.2 The flag today (`chat_v2`, phone only)

- `src/lib/chat/flag.ts` (pure, no imports): `chatV2MayRunHere(env)` `:46` (production or `next dev` only), `chatV2Enabled(env)` `:54` (`CHAT_V2_ENABLED === "true"`), `chatV2Everyone` `:63`, `chatV2ListedUser(userId, env)` `:73`, `chatV2ClubIds(env)` `:90`. Every reader checks the switch first.
- `src/lib/chat/flag-server.ts:75` `chatV2For(userId): Promise<boolean>` (server-only; fails closed; one `org_members` read for the club list).
- `src/app/api/me/features/route.ts:24-36`: `GET` answers `{ ok: true, chat_v2: boolean }`, 401 signed out, `private, no-store`. Type: `src/lib/chat/types.ts:178` `FeaturesResponse = { ok: true; chat_v2: boolean }`.
- `src/lib/chat/use-chat-v2.ts:30` `useChatV2(): boolean | null`: one request per mount, `null` until it answers, any failure is `false`.
- Env docs: `.env.example:169-188`. The worktree's `.env.development.local` already holds `CHAT_V2_ENABLED` and `CHAT_V2_ALLOWLIST` (no `CHAT_V2_CLUBS`).
- Who reads it on a screen: only `src/components/mobile/CampusMobile.tsx` and `src/components/mobile/MessagesMobile.tsx`. No desktop file does.

### 1.3 Desktop Campus > Chat (`src/app/campus/campus-home.tsx`, 17,286 lines)

The tab:
- `:377` `type CampusTab = "feed" | "events" | "orgs" | "chat" | "map"`.
- `:381-387` `TABS` (the Chat entry is `:385`). `:174-180` `CAMPUS_TAB_KEYS`, `:182-187` `parseInitialTab(raw)`: `?tab=chat` is accepted.
- **The tab button:** `CampusTabs({ active, onChange, hideMap, palette })` `:6153-6217`. It filters `TABS` only for the Map (`:6166`), then draws one pill per tab (`:6185-6213`). Mounted once, in `CampusTopBar` at `:5393` (`CampusTopBar` is `:5120`, mounted at `:922-927`).
- Tab state: `:470-488` (seeded once from the URL; `?welcome`, `?post`, `?tag` force Feed). Tab changes never touch the URL.
- Deep link `?tab=chat&org=<handle>&channel=<id>`: refs at `:494-499`; the org is picked at `:672-681`, the room at `:721-733`.
- Things keyed on `tab === "chat"`: the dark backdrop `:369`, hiding the Otto orb (`body.vibe-hide-otto`) `:538-544`, `showThreeColumn` `:892`, the page locked to `100dvh` `:906-908`.

The tab body (all in `CampusHome`, `:448`):
- Loading your clubs: `/api/orgs?filter=mine` on every mount of Campus, whatever the tab (`:650-688`). Rooms of the active club: `/api/orgs/<handle>/channels` (`:703-738`).
- **The body branches: `:943-1007`.** Load failure `:943-961`; `LoadingPane` `:962-963`; the three rails `:964-1001` (grid `72px 240px 1fr` at `:970`); `EmptyState` (no clubs) `:1002-1007`. Everything else is `TabBody` `:1008-1032`.
- The rails: `ServerRail` `:15220`, `ChannelRow` (the "#" row) `:15437-15554`, `ChannelRail` `:15555-15798`, `ChannelMain` `:15800-15959`, `ChannelChat` `:15960-17123`, `EmptyState` `:17124`.
- Old words still on screen: "📌 Pinned" `:15714`, "Text channels" `:15727`, "+ Channel" `:15774`, "Create a channel" `:1493`.
- `ChannelChat` reads `GET /api/me/threads/<id>/messages?limit=80` every 2 s (`:16089-16092`), never calls `/read` (0 matches for `/read` in the file), and its hover row has reactions and Reply only (about `:16520-16595`).
- A room you cannot post in already swaps the composer for one line: `canPost` from the thread read's `viewer.can_post` (`:16015-16016`), the line at `:16736-16757` (`REFUSAL_SENTENCES.board_officers_only` or `.room_closed`). Only those two sentences exist.

**The club Settings door (the only one on any screen):**
- The button: `ChannelRail` footer, `:15777-15793` ("Settings", shown to every member), beside "+ Channel" for owner/admin `:15758-15776`. The per-room gear: `ChannelRow`'s `onSettings` `:15722`, `:15735` (owner/admin only).
- State: `showCreateChannel`, `showSettings`, `channelSettingsId` `:508-510`. Mounts: `CreateChannelModal` `:1041-1047`, `OrgSettingsModal` `:1049-1063`, `ChannelSettingsModal` `:1065-1099`. All three need `activeOrg` (the campus `Org` row with `role`, from `/api/orgs?filter=mine`) and the room list of that club.
- `CreateChannelModal({ org, onClose, onCreated })` `:1444-1565`: `POST /api/orgs/<handle>/channels` with `{ name, topic, is_private }` (`:1464-1471`).
- `OrgSettingsModal({ org, channels, channelsErr, onRetryChannels, onClose, onOrgUpdated, onOrgRemoved, onChannelUpdated, onChannelRemoved })` `:1575-1733`. Tabs `:1609-1617`: Overview, Channels (owner/admin), Members, Followers (owner/admin), Invites (owner/admin, not hidden), Requests (staff), Danger. Sections: `SettingsOverview` `:1735`, `SettingsChannels` `:2016` + `ChannelEditorRow` `:2060`, `SettingsMembers` `:2253`, `SettingsFollowers` `:2507`, `SettingsRequests` `:2845`, `SettingsDanger` `:3047`.
- `ChannelSettingsModal({ org, channel, allChannels, onClose, onChannelUpdated, onChannelRemoved, onChannelsReordered })` `:3223-3349`. Tabs `:3245-3249`: Overview (`ChannelOverview` `:3351`), Access (only a private, non-event room, owner/admin; `ChannelAccess` `:3582`, which lists, adds and removes people through `/api/orgs/<handle>/channels/<id>/members` `:3595`, `:3627`), Danger (`ChannelDanger` `:3795`; not for Board, Lounge, Officers or event rooms, `isCoreRoom` `:1437-1439`).
- Shared pieces they lean on, all private to this file: `ModalShell` `:3843`, `Field` `:4168`, `ChoiceField` `:4201`, `LinksEditor` `:4034`, `chatRefusalLine` `:1425`, the `Role` / `Org` / `Channel` types (`:189-225`), `COLORS`, the modal styles.
- **None of the three modals is exported or used anywhere else** (grep of `src/`: only `campus-home.tsx`). The club page's officer bar (`src/app/orgs/[handle]/admin-actions.tsx:105-114`) has Invite, Banner, Logo, Edit details, New post: no members, no rooms, no requests, no delete. The phone has no room or member management at all (no file under `src/components/mobile` calls a `/channels` write or `/members` of a club).

### 1.4 How the phone drops its Chat pill (the pattern to copy)

All in `src/components/mobile/CampusMobile.tsx`:
- `:91-96` the tab orders, and two more without `"chat"` (`CHAT_V2_TAB_ORDER`, `CHAT_V2_VISITING_CLOSED_TAB_ORDER`).
- `:196` `const chatV2 = useChatV2();` and `:198-205` the order is picked from it. `null` and `false` keep today's tabs; only `true` drops Chat.
- `:288` `initialChannelId` from `?channel=`. `:298-300`: `urlChatWanted` (URL says `tab=chat` or has `channel`), `chatWanted`, `oldChatMounts = chatV2 === false || (chatV2 === null && !urlChatWanted)`.
- `:303-311` the redirect, once (a ref guards it): `router.replace("/messages" + (initialChannelId ? "?channel=" + encodeURIComponent(initialChannelId) : ""))`. `?org=` is dropped.
- `:1004` the chat pane is not rendered when `chatV2 === true && tab !== "chat"`; inside it a skeleton shows while the flag is unknown and the URL asked for chat; `:1088` the old conversation view mounts only when `oldChatMounts`.
- The rule in words (contract `wave-2-contracts.md:163-170`): unknown flag + URL asks for chat = skeleton, nothing old mounts; unknown flag on a plain `/campus` = today's page; `true` = no pill, redirect; `false` = today.

### 1.5 The proxy (`src/proxy.ts`, 330 lines)

- `proxy(request)` `:222`. Order: refresh the session (`:223`); a restricted account gets `/account/suspended` and refused writes (`:239-249`); the static pages (`:251-299`); `/profile` signed out goes to login (`:302-307`); `/feed` goes to `/campus` while the feed flag is off (`:311-313`).
- `HTML_TO_CLEAN` `:36-47` maps `/html/messages.html` to `/messages`. `APP_HTML` `:50` = `profile.html`, `messages.html`. `/html/messages.html` without a session goes to login with `next=/messages` (`:293`); with a session and `?app=1` it is served (`:294`); with a session and no `?app=1` it redirects to `/messages` (`:298`). Extra query keys (`embedded`, `to`, `channel`, any new one such as `pane`) pass through untouched.
- There is no rule about `/campus` or `/messages` query strings, and the proxy cannot read the chat flag cheaply (it would need `chatV2For`'s database read on every request).
- Matcher `:326-330` skips `_next/static`, images, `sw.js`, `offline.html`, the manifest. `scripts/check-pwa.mjs` tests the matcher line.
- `next.config.ts:42-63` `redirects()`: only `/html/landing.html`, `/opportunities`, and the apex-to-www host rule. Static redirects cannot know a per-person flag either.

### 1.6 Every link into a chat

"Today" = what a laptop gets now. "Switch on" = what it must get with the desktop switch on. Nothing in this table needs a new route.

| # | Where the link is made | The address | Today on desktop | Switch on |
|---|---|---|---|---|
| 1 | Left nav "Messages": `src/components/LeftNav.tsx:98` | `/messages` | the iframe list | the new home (point 3) |
| 2 | Push: a DM, a group message, a message request: `src/lib/push/payload.ts:322` (`threadPath`), used at `:444`, `:457`, `:473`. Tapped through `public/sw.js:274-309` (top-level windows only, `:315-320`) | `/messages?channel=<id>` | the iframe opens that thread if it is in its list, then strips `?channel=` from the address bar (`public/html/messages.html:3661-3668`) | opens straight into that chat; the address keeps `?channel=<id>` |
| 3 | Push: an @mention in a club chat: `payload.ts:400-411` | `/orgs/<handle>` (the club page, never the room; pinned by `src/lib/push/payload.test.ts:354`) | the club page | unchanged (see open question 5) |
| 4 | Push: invite, approval, cancelled event: `payload.ts:413-436` | `/orgs/<handle>` | the club page | unchanged |
| 5 | Otto panel, "mentioned you in a chat": `src/components/network/OttoSidePanel.tsx:960-963`; static twin `public/html/_otto.js:880-882` | bare `/messages` | the iframe list, no room opened | the new home; the room is not opened because the notice carries `message_id` only (`src/app/api/me/notifications/route.ts:51`), see open question 4 |
| 6 | Otto page, "N unread DMs, Open inbox": `src/components/otto/OttoRequests.tsx:56` | `/messages` | the iframe list | the new home |
| 7 | Club page, the rooms list: `src/app/orgs/[handle]/ChannelsSection.tsx:314` (one `Link` per room, shown to members, phone and desktop) | `/campus?tab=chat&org=<handle>&channel=<id>` | Campus > Chat on that club and room | must land on `/messages?channel=<id>` (the phone already does, `CampusMobile.tsx:308-311`) |
| 8 | People cards, "Message": `src/components/network/UserCard.tsx:441-452` (`POST /api/me/threads { handle }` then a full navigation) | `/messages?channel=<dm id>` | the iframe opens the DM | the DM open state |
| 9 | Event attendees sheet on Campus, "Message" one person and "Message all": `campus-home.tsx:10752-10763`, `:10768-10790` | `/messages?channel=<dm or new group id>` | the iframe opens it | the DM or group open state |
| 10 | Profile page (static), Message buttons: `public/html/profile.html:6901`, `:7378` | `/messages?to=<handle>` | the iframe finds or creates the DM (`messages.html:3626-3650`), then strips `?to=` | the new page must resolve `?to=` itself (the phone does it at `MessagesMobile.tsx:424-434`: an existing thread, else `POST /api/me/threads { handle }`) or hand `?to=` to the thread-only iframe |
| 11 | Profile page, the activity list's Message: `profile.html:11337-11346` | `/messages?channel=<id>` or `?to=<handle>` | as rows 8 and 10 | as rows 8 and 10 |
| 12 | The chat bubble on the profile page: `public/html/_miniMessenger.js` (loaded only by `profile.html:32`). List from `GET /api/me/threads` (`:341`, club rooms included). "Open" `:435`, "Start one" `:496` | `/messages` | the iframe list | the new home |
| 13 | The chat bubble, "Expand": `_miniMessenger.js:580` | `/messages?to=<peer.handle>` | for a group or a club room `peer` is some other member, so Expand opens a DM with that person (audit M3) | `/messages?channel=<thread id>` for anything that is not a DM |
| 14 | Campus top bar, the Messages icon: `campus-home.tsx:4967-4969` | `/messages` | hidden on desktop by CSS (`src/app/globals.css:2790-2792`) | no change |
| 15 | Installed-app shortcut: `src/app/manifest.ts:71` | `/messages` | the iframe list | the new home |
| 16 | Old static address: `/html/messages.html` without `?app=1` | redirect to `/messages` (`src/proxy.ts:298`) | the iframe list | the new home |
| 17 | Phone pieces the desktop will reuse: week cards `src/components/mobile/messages/home/YourWeek.tsx:502-512` (an `<a href="/messages?channel=…">` whose click is cancelled and handed to `onOpenRoom`), `club/ClubSpace.tsx:113-115` (`roomUrl`), `MessagesMobile.tsx:145` (`channelUrl`) | `/messages?channel=<id>` | not on desktop today | same address; the desktop shell supplies its own `onOpenRoom` |

Not links, but they write into chats from outside Messages: `src/components/mobile/SharePostSheet.tsx:130` and `public/html/_sharePicker.js` (share a post to a thread). They do not navigate. No change.

No email template and no file under `src/lib/email` links to `/messages` or `/campus?tab=chat` (grep: zero).

### 1.7 The gates

Commands (`package.json:5-12`):
- `npm test` = `node --test $(git ls-files -co --exclude-standard 'src/**/*.test.ts')`. Only files under `src/` ending `.test.ts`, tracked or untracked-and-not-ignored. A test outside `src/` (for example under `handoffs/`) is not run by it. The route tests need Node 22.15 or newer (`module.registerHooks`, `src/lib/chat/otto-unread-route.test.ts:27`); this Mac has v25.9.
- `npm run typecheck` = `tsc --noEmit`.
- `npm run lint` = `eslint` (config `eslint.config.mjs`: Next core-web-vitals + TypeScript; `mobile/**` ignored). Per-file: `npx eslint <path>`.
- `npm run build` = `next build`. The wave-2 rule (`wave-2-contracts.md:1065`): typecheck, tests, then build, then per-file eslint compared against the base for files that carry old problems. The build is the only check that sees a `server-only` import in a client file, a bad route export, or `useSearchParams` outside Suspense. It also runs the key guard (`next.config.ts:4-20`) and compiles from scratch (`next.config.ts:31`).
- There is no CI folder (`.github/workflows` does not exist). Vercel builds on push.
- SQL checks for any migration, run on the local stack: `scripts/sql/chat-v2-rooms-check.sql` (200 checks; `can_post_org_channel` is exercised at `:741-746`, `:796-797`), `scripts/sql/chat-v2-cards-check.sql`, `scripts/sql/chat-latest-check.sql`, `scripts/sql/chat-v2-after-deploy.sql`.

Tests that pin chat behaviour the desktop work can touch (test counts from today's run):

| Test file | Tests | What it pins | Why desktop work can break it |
|---|---|---|---|
| `src/lib/chat/flag.test.ts` | 23 | the switch rules, and that the switch is never read from a `NEXT_PUBLIC_` or push variable (`:98`) | a new desktop switch written into `flag.ts` must follow the same shape and gets its own cases here |
| `src/lib/chat/reads-routes.test.ts` | 15 | `/api/me/inbox`, `/api/orgs/[slug]/space`, `/api/me/calendar` field by field; 404 with the flag off (`:266`, `:625`, `:752`) | it replaces `@/lib/chat/flag-server` with a stub that exports ONLY `chatV2For` (`:45-46`). A route under test that imports a second name from `flag-server` fails to load |
| `src/lib/chat/cards/routes.test.ts` | 34 | the card and vote routes, and the exact ORDER of gate calls (`:290-360`) | same stub (`:73-74`); a new gate call in those routes changes the pinned order |
| `src/lib/chat/threads-list-route.test.ts` | 4 | `GET /api/me/threads` reads (reads the route file as text too) | a change to that route for `?scope=` or `peer` |
| `src/lib/chat/remove-route.test.ts` | 38 | `DELETE …/messages/[messageId]` | if a deleted or removed message must also drop its pin through this route |
| `src/lib/chat/message-read.test.ts` | 12 | the thread read | if the thread read gains a `pinned` field |
| `src/lib/chat/use-room-poll.test.ts` | 10 | reads `use-room-poll.ts` and `components/mobile/messages/club/RoomChips.tsx` as TEXT (`:16`, `:130`): the chip of the open room never draws the unread dot | point 11 edits `RoomChips.tsx` (lock mark, megaphone, extra rooms); a rename or reshape there turns this red |
| `src/lib/chat/layer-stack.test.ts` | 45 | the phone's Back-button layering | desktop must not route through `layer-stack.ts`; if a shared sheet shell changes how sheets push history, this is the tripwire |
| `src/components/mobile/messages/home/home-rules.test.ts` | 17 | filters, `homeUrl`, row order, previews, the week and month rules | the desktop inbox and week band reuse these rules; changing a rule for desktop changes the phone |
| `src/components/mobile/messages/club/helpers.test.ts` | 7 | club space helpers | reused by the desktop club pane |
| `src/components/mobile/messages/cards/card-rules.test.ts`, `compose/sheet-rules.test.ts` | 16, 9 | card and sheet rules | reused as is |
| `src/lib/chat/room-rules.test.ts`, `room-state.test.ts` | 30, 19 | who may post, room states, refusal codes | point 11's "who can post" changes `postRefusal` / adds a code |
| `src/lib/theme/theme.test.ts` | 12 | DRIFT: the `<head>` of `public/html/messages.html`, `profile.html`, `onboarding.html`, `public/offline.html` must carry `THEME_BOOT_SCRIPT` verbatim (`:236-258`); `_persistence.js` must match the default theme (`:266-277`) | the thread-only mode edits `messages.html`: never touch its first `<head>` script |
| `src/lib/push/payload.test.ts` | 39 | every push address: `/messages?channel=<id>` for DM, group, request (`:144`, `:255`, `:312`); the club page for a club-chat mention (`:354`) | changing where a push lands |
| `src/lib/native/bridge.test.ts` | | a push tap path keeps `/messages?channel=…#…` (`:14`, `:24`) | the address shape must stay |
| `src/components/mobile/mobile-tab-active.test.ts` | 6 | reads `MobileTabBar.tsx` as text; the tab hrefs | only if tab hrefs change (they should not) |
| `src/lib/messages/group-rules.test.ts` | 7 | reads `api/me/threads/route.ts` and `…/[id]/members/route.ts` as text (`:78-79`) | edits to those two routes |
| `src/lib/messages/reaction-emoji.test.ts` | 8 | the reaction list, mirrored in `messages.html` and `_miniMessenger.js`; reads a migration as text | the hover toolbar's react list must use the same list |
| `src/lib/safety/pair-block.test.ts`, `pair-block-group.test.ts` | 22, 7 | block rules in DMs and groups | pins in a blocked pair must follow these |
| `src/lib/feedback/failure-copy.test.ts` | | reads `public/html/_persistence.js` (`:108`) | only if `_persistence.js` is edited |

No test reads `campus-home.tsx`, `MessagesSwitch.tsx`, `CampusMobile.tsx`, `MessagesMobile.tsx`, `ChannelsSection.tsx`, `proxy.ts` or `_miniMessenger.js` as text (grep of every `*.test.ts`). Those files are covered only by typecheck, lint, build and the browser walk.

### 1.8 The local walk

Accounts (local stack only, one password for all, set in the seeds: `scripts/local-seed.mjs:167-182`, `scripts/demo-seed.mjs:146`):
- Test set, `<name>@example.test`: avery (`avery_owner`, owner), blake (`blake_iu`, member), casey (`casey_purdue`, mod in `chat_seed_club`), drew (`drew_new`, not onboarded, no school email), emery (`emery_admin`, admin in `chat_seed_club`).
- Demo cast (`scripts/demo-seed.mjs:304-343`): franky (the lead, a plain member of SAE), james (SAE officer), rylan, maya, theo, priya, jonah, amara, lucas, hana, devon, noor, eli. They live on a different campus from the test rows on purpose (`demo-seed.mjs:25-35`).
- Sign in without typing a password: `node handoffs/chat-redesign/wave-1-build/tools/cookie.mjs <who>` prints the cookie (`sb-127-auth-token=…`, split into `.0`, `.1` parts when long); it refuses anything but the local stack.

Clubs on the local stack:
- `chat_seed_club` (`local-seed.mjs:485-492`): avery owner, emery admin, casey mod, blake member. Lounge with four messages and a reply (`:509-513`), a Board, an Officers room. Events: "Chat Seed Game Night" in 5 days (blake going, casey maybe), "Chat Seed Cookout" ended 3 days ago (event chat still open), "Chat Seed Callout" ended 10 days ago (event chat closed) (`:524-534`). One poll, one sign-up and one Event card in its Lounge (`:634-742`). The seed writes NO block rows (grep `block` in `local-seed.mjs`: zero): to walk a blocked pair (stubs, pins in a blocked DM) block by hand first, as the wave-2 review did.
- `sae` (`local-seed.mjs:477-484`): Lounge (private in the old shape), Board, **an extra room `events` (kind `room`)**, and `exec` as the Officers room. The only seeded club with an extra room: use it for point 11. The demo seed renames it "SAE" and adds james (officer) and franky (member) and one message in the `events` room (`demo-seed.mjs:473`, `:1333`).
- `test_invite_club`, `test_open_club`, `test_request_club`, `test_hidden_club` (`local-seed.mjs:289-296`): core rooms only.
- Demo clubs (`demo-seed.mjs:473-487`): `chess_club`, `finance_club`, `tower_floor_3`, `north_hall`.
- Event dates are computed from the day the seed runs (`local-seed.mjs:26-34`): re-run `node scripts/local-seed.mjs` on the day of the walk or the "live", "after" and "closed" event chats drift.
- No seeded room is "some members can see it, only some can post". That shape does not exist yet (section 5, trap 12).

Flag setup for a walk: `.env.development.local` with the local keys, `CHAT_V2_ENABLED=true`, `CHAT_V2_ALLOWLIST=<ids>` and whatever the new desktop switch is called. A changed env value needs a dev-server restart.

### 1.9 The owed old-screen fixes (audit of Sept 30) and where they stand

All six are still open in code today (checked: `campus-home.tsx` has 0 `/read` calls; `threads/route.ts:826` still sends `peer` for every type; `api/me/threads/[id]/clear/route.ts` has no club-room check and `messages.html:3115` still offers Clear; no migration after `20261001120000`; `ChannelChat` imports no `ReportSheet`; the notifications select has no room id).

| Item | What | Files | With the desktop switch ON | Still matters for people WITHOUT it |
|---|---|---|---|---|
| M2 | officers of a hidden club can delete its events by a raw request, which wipes the event chat | a migration (`events_delete_manager`, `posts_delete_club_officer`) | not touched by the desktop build | yes, for everyone; it is a database rule. Separate small migration, not part of this build |
| M3 | old lists treat a club room or group as a 1:1 with a random member; Expand opens a DM with them | `src/app/api/me/threads/route.ts:606-612`, `:826`; `_miniMessenger.js:510-580`; `MessagesMobile.tsx` old header | the new desktop home does not use `peer` for clubs, but the DM thread is still `messages.html` and the chat bubble on the profile page is unchanged, so it is NOT made unnecessary | yes: old phone list, old desktop list, the chat bubble. The server fix (`peer: null` unless `dm`) fixes all of them at once |
| M4 | "Clear chat history" on a club room does nothing | `api/me/threads/[id]/clear/route.ts`, `messages.html:3115`, `:3310-3317`, old `MessagesMobile` menu | unnecessary for club rooms (they no longer open in `messages.html`); the thread-only mode only shows DMs and groups | yes: old desktop list and old phone list |
| M5 | Campus > Chat never marks a room read | `campus-home.tsx` `ChannelChat` (`:15960`) | unnecessary: Campus > Chat is gone for them and `use-room-poll.ts` marks read | yes: every laptop without the switch |
| M8 | Campus > Chat has no Report or Delete; Officers opens nowhere else on desktop | `campus-home.tsx:16520-16595` | unnecessary: the hover toolbar has Report / Remove and the Officers chip is in the club pane | yes: every laptop without the switch |
| I3 | desktop cannot open an event chat or a Board reply; a mention there leads nowhere | `messages.html:3653-3660`, `api/me/threads/route.ts:487`, `api/orgs/[slug]/channels/route.ts:105`, Otto links | unnecessary for event chats and Board replies (points 5 and 7). The Otto mention link still lands on the bare home until the notice carries the room | yes: every laptop without the switch, from the day event-chat pushes reach them |

## 2. Reusable on desktop AS IS

- **`useChatV2`'s shape** (`src/lib/chat/use-chat-v2.ts:30-58`): one request, `null` / `true` / `false`, fail closed, no cache. A desktop twin (`useChatDesktop`) can read the SAME response if the features route adds one key. Safe: the hook has no phone code in it.
- **`GET /api/me/features`** (`src/app/api/me/features/route.ts`): add a key, keep `chat_v2`. Safe: `isOn` in `use-chat-v2.ts:26-28` checks only `ok === true && chat_v2 === true`, so an extra key changes nothing for the phone. No test reads this route.
- **`flag.ts`'s pattern** (pure, env as a parameter, the switch checked first in every reader): copy it for the desktop switch. Safe because `flag.test.ts` shows exactly what cases the twin needs.
- **The phone's Campus pattern** (`CampusMobile.tsx:196-205`, `:298-311`): three states, redirect once with a ref guard, drop `?org=`. It is plain React and `next/navigation`; nothing in it is touch-only. Copy it into `CampusHome`.
- **Every address in table 1.6**: `/messages`, `/messages?channel=<id>`, `/messages?to=<handle>`, `/messages?tab=<filter>` (`home-rules.ts:25-33` `parseHomeFilter`, `homeUrl`). The server page already passes `to` and `channel` (`src/app/messages/page.tsx:26-36`). Safe: the push, the service worker and the native bridge all assume these shapes and are tested on them.
- **Push payloads and the service worker**: no change needed. `sw.js:315-320` already ignores nested frames, so a thread-only iframe inside the new page is never navigated by a push tap.
- **The proxy**: no change needed. `/html/messages.html?app=1&embedded=1&<anything>` is served to a signed-in user as today (`src/proxy.ts:294`), so a new query key for the thread-only mode needs no proxy edit, and the suspended-account gate still covers it (`:239-249`).
- **`CampusAppShell`** (`src/components/campus-app-shell.tsx:33-50`): the left nav with My Calendar stays as is (point 1), and it already hides the Otto orb on `/messages` (`:35`).
- **The three club modals in place** (`OrgSettingsModal`, `ChannelSettingsModal`, `CreateChannelModal`): they work today on a laptop and call existing routes. Reusable as is IF they stay inside `campus-home.tsx` and are opened by an address (section 3.3), not moved.
- **The old "cannot post here" line** (`campus-home.tsx:16736-16757`) as the pattern for point 11: composer replaced by one `role="note"` line, driven by `viewer.can_post` from the thread read.
- **`cookie.mjs`, `local-seed.mjs`, `demo-seed.mjs`**: as is for the walk.
- **`ChannelsSection.tsx`**: leave the file alone, as the wave-2 contract ruled (`wave-2-contracts.md:170`); the redirect in Campus handles it.

## 3. Phone-shaped or old-desktop-shaped: what needs a twin, and the smallest way

### 3.1 The desktop switch (new, small)

Nothing exists. Smallest way:
- `src/lib/chat/flag.ts`: add `chatDesktopEnabled(env)`, and list readers if a per-person list is wanted, in the same shape (the switch first; production or `next dev` only via `chatV2MayRunHere`). New cases in `flag.test.ts`.
- A server answer for a person. Put it in a NEW file (for example `src/lib/chat/flag-desktop-server.ts`), not as a second export of `flag-server.ts` that gated routes import (trap 3).
- `src/lib/chat/types.ts:178`: `FeaturesResponse` gains an optional or required boolean (name it once in the contract, for example `chat_desktop`); `src/app/api/me/features/route.ts:34` fills it.
- A client hook beside `use-chat-v2.ts` that reads the same route.
- `.env.example` documents the new variables under `:169-188`.

### 3.2 Campus > Chat with the desktop switch on (`campus-home.tsx`, one batch owns the file)

Today `CampusHome` has no flag and no router (`:5` imports only `useSearchParams`). Smallest change, mirroring the phone:
1. Call the desktop hook near `:469`. Import `useRouter`.
2. `CampusTabs` (`:6153-6217`) gets a `hideChat` prop beside `hideMap` (`:6166` filters `TABS`); `CampusTopBar` (`:5120`, `:5393`) passes it; `CampusHome` passes `flag === true` at `:922-927`.
3. A derived tab, like `shownTab` at `:890`: when the flag is `true`, `"chat"` shows as `"feed"`. Use the derived tab at the seven places keyed on chat (`:369` via `getTabScene`, `:539`, `:892`, `:906`, `:943`, `:962`, `:1002`) so the rails, the dark backdrop, the `100dvh` lock and the hidden Otto orb never appear.
4. The redirect: when the flag is `true` and the URL asked for chat (`?tab=chat` or the tab state is chat), `router.replace("/messages" + (channel ? "?channel=" + encodeURIComponent(channel) : ""))` once. The room id is already captured at `:497-499`.
5. While the flag is `null` and the URL asked for chat: render `LoadingPane` (`:1121`), not the rails. On a plain `/campus` with the flag `null`: today's page (the phone's rule).
6. Flag `false`: every line as today.

### 3.3 The door to club and room management ("Manage club", and point 11's rooms door)

The modals cannot be imported from Messages: they are private functions inside a 17,286-line client file and lean on about ten private helpers (1.3). Two ways:
- **Smallest (recommended):** keep them where they are and open them by address. `CampusHome` reads `?manage=<club handle>` (and optionally `&room=<id>` or `&new_room=1`) once on mount, like `?org=` at `:494-496`; when the clubs load (`:672-681`) it selects that club and sets `showSettings` / `channelSettingsId` / `showCreateChannel`. The modals already render outside the tab body (`:1041-1099`), so they open over the Feed with no rails. The desktop club panel's "Manage club" is then a plain link to `/campus?manage=<handle>`. Cost: about 30 lines in one file; a full page change when clicked.
- **Larger:** move the three modals and their helpers (about `:1437-4290`, roughly 2,800 lines) into their own module and mount them from the desktop Messages page. Cleaner, but it is a big mechanical move of code that has no tests.

Either way the "who can post" control for a room has no home today: `ChannelSettingsModal`'s Access tab only manages who can SEE a private room (`ChannelAccess` `:3582`), and `CreateChannelModal` only has name, topic and private (`:1453-1471`).

### 3.4 `/messages?to=<handle>` on the new page

Today only the iframe resolves it (`messages.html:3626-3650`) and the phone (`MessagesMobile.tsx:424-434`). The new desktop shell needs its own resolve step (find the DM in the list, else `POST /api/me/threads { handle }`, then open it and `replaceState` to `?channel=<id>`), or it passes `to=` into the thread-only iframe and listens for the id. The first is smaller and matches the phone.

### 3.5 The chat bubble on the profile page (`public/html/_miniMessenger.js`)

It is a static script with no flag. Smallest useful change, safe for everyone: "Expand" (`:580`) points at `/messages?channel=<thread id>` whenever the thread is not a DM (this is audit M3's client fix and is correct on old and new Messages alike). Listing DMs and groups only (`?scope=chats`, `api/me/threads/route.ts:427`) would need the script to ask `/api/me/features` first; leave that out unless the planner wants it (open question 6).

## 4. Contracts the desktop build must not break

### 4.1 Flag rules

- With the desktop switch off, a laptop sees exactly today's screens: `MessagesSwitch.tsx:39-65` renders the iframe with the same `src` (`/html/messages.html?app=1&embedded=1[&to=][&channel=]`), and `CampusHome` shows the Chat pill, the rails and the three modals unchanged.
- The phone branch of `MessagesSwitch.tsx` (`:28-37`) and all of `CampusMobile.tsx` are untouched by the desktop switch. The phone's new pin actions and room rules hang on `chat_v2`, not on the desktop switch.
- The switch is server-only env, never `NEXT_PUBLIC_` (`flag.test.ts:98` pins this for `chat_v2`; `.env.example:171-173`). It counts only on production and in `next dev` (`flag.ts:46-48`): a Vercel Preview shows nothing behind it.
- `FeaturesResponse` keeps `ok: true` and `chat_v2: boolean` (`types.ts:178`); `useChatV2` reads only those two (`use-chat-v2.ts:26-28`).
- The gated routes answer 404 `not_found` when `chatV2For` says false (`flag-server.ts:22-23`): `/api/me/inbox`, `/api/orgs/[slug]/space`, the card and vote routes; `/api/me/calendar` nulls three fields. **So a laptop with the desktop switch ON but `chat_v2` OFF gets 404s from the very routes the new page reads.** The desktop switch must imply `chat_v2` for that person (open question 2).
- Fail closed: a screen that cannot learn the flag shows the old screen, never a blank (`use-chat-v2.ts:19-21`).

### 4.2 Addresses and route shapes

- `/messages?channel=<id>`, `/messages?to=<handle>`, `/messages?tab=chats|clubs|requests` keep their meaning (`wave-2-contracts.md:172-180`; `home-rules.ts:25-33`). `page.tsx` lower-cases `to` and trims `channel` (`:27-30`).
- Push addresses: `payload.test.ts:144`, `:255`, `:312`, `:354`. The native push tap keeps path, query and `#hash` (`src/lib/native/bridge.test.ts:14`, `:24`).
- `/campus?tab=chat&org=<handle>&channel=<id>` is still produced by `ChannelsSection.tsx:314` for everyone; both Campus trees must keep accepting it.
- `/campus?tab=feed|events|orgs|map`, `?post=`, `?tag=`, `?event=`, `?welcome=1`, `?campus=` keep working (`campus-home.tsx:470-506`, `:524-526`); a new `?manage=` must not disturb them.
- `/html/messages.html` stays reachable only with a session and `?app=1` (`src/proxy.ts:293-298`), and the suspended gate applies to it.
- `POST /api/me/threads { handle }` answers `{ channel_id }` (used by `UserCard.tsx:446`, `campus-home.tsx:10756`, `profile.html:11340`); `GET /api/me/threads` and `?scope=chats` (`route.ts:408`, `:427`, `:487`) keep their shape; `threads-list-route.test.ts` and `group-rules.test.ts` read that route.
- `GET /api/orgs/<handle>/channels` keeps leaving event chats out (`channels/route.ts:105`): the club page's rooms list and the old rails depend on it.

### 4.3 Tests that pin behaviour

The table in 1.7. The ones most likely to go red from desktop work: `use-room-poll.test.ts:129-130` (reads `RoomChips.tsx` as text), `theme.test.ts:236-258` (the `<head>` of `messages.html`), `reads-routes.test.ts:45-46` and `cards/routes.test.ts:73-74` (the `flag-server` stub), `cards/routes.test.ts:290-360` (gate order), `payload.test.ts:354` (the club-mention address), `layer-stack.test.ts` (phone history), `home-rules.test.ts` (shared rules).

### 4.4 Lint, typecheck, build baselines (today, this tree)

- `npm run typecheck`: exit 0.
- `npm test`: 1,839 pass, 0 fail.
- `npx eslint <file>`, problems already in the file (a batch may add none; compare rule by rule against the base as wave 2 did):
  - `src/app/campus/campus-home.tsx`: 6 warnings, 0 errors.
  - `src/components/mobile/CampusMobile.tsx`: 4 errors.
  - `src/components/mobile/MessagesMobile.tsx`: 2 errors.
  - `src/components/network/OttoSidePanel.tsx`: 4 warnings.
  - `src/app/messages/MessagesSwitch.tsx`, `src/app/orgs/[handle]/ChannelsSection.tsx`, `src/components/LeftNav.tsx`, `src/lib/chat/use-chat-v2.ts`: clean.
- `npm run build` must exit 0 (not run for this map).
- Migrations: the repo's style is in `supabase/migrations/20261001100000_chat_v2_rooms.sql` (pre-flight, post-checks by reading and by behaviour, a ROLLBACK note, grants to anon, authenticated and service_role at `:1399`). Local stack only in this build.

### 4.5 The Oct 15 freeze

The freeze covers what a person WITHOUT any switch sees (`wave-2-contracts.md:1357-1376`, eleven rows). A flag-independent edit to an old screen (the chat bubble's Expand, a `/read` call in `ChannelChat`, `peer: null`) adds a row to that list and must land before Oct 15 or wait. Switch-gated desktop code may deploy after.

## 5. Traps

1. **The iframe eats the deep link.** When `messages.html` opens a `?channel=` or `?to=` thread it deletes that key from the TOP window's address (`messages.html:3632-3639`, `:3661-3668`, through `__vibeTopReplaceState`, `public/html/_persistence.js:147-155`). Inside the new page a thread-only iframe would strip `/messages?channel=<id>` back to `/messages`, and a reload would land on the home. The thread-only mode must skip that strip.
2. **The server renders the desktop tree for everyone** (`use-is-mobile.ts:36-40`). If the desktop branch of `MessagesSwitch` waits on a client hook, a flag-off laptop sees a skeleton before today's iframe (a visible change for people without the switch), and if it does not wait, the iframe (with its 2-second timers) loads and is then thrown away for flag-on people. Deciding the flag in the server page and passing it as a prop avoids both (open question 1).
3. **The `flag-server` stub.** `reads-routes.test.ts:45-46` and `cards/routes.test.ts:73-74` swap `@/lib/chat/flag-server` for a module that exports only `chatV2For`. Any route those tests load that imports another name from `flag-server` dies at import. Keep the desktop answer in its own file, or have those routes keep importing only `chatV2For`.
4. **Desktop switch on, `chat_v2` off = a page of 404s** (4.1). Decide the relationship in the contract, in `flag.ts`, with tests.
5. **A changed switch needs a redeploy on Vercel and a dev-server restart locally** (`wave-2-contracts.md:1075` step 6; env is read at build). Do not conclude "the flag does not work" from a hot reload.
6. **`RoomChips.tsx` is read as text by a test** (`use-room-poll.test.ts:129-130`). Point 11 changes the chips (lock, megaphone, extra rooms, restricted rooms). Read that test before editing the file.
7. **`messages.html` `<head>` is pinned** (`theme.test.ts:236-258`). Add the thread-only mode's CSS and script below the theme boot script, never before or inside it. `messages.html` also has its own nav and list hidden by `body.vibe-embedded` CSS (`messages.html:29-30`); a second mode needs its own class.
8. **`CampusHome` has no router and never writes the tab to the URL** (`campus-home.tsx:5`, `:465-468`). The redirect must be a `router.replace` (as on the phone, `CampusMobile.tsx:310`): it swaps the `/campus?tab=chat` entry for `/messages`, so Back goes to the page before it (the club page, for row 7 of table 1.6). A `push` would leave the chat address in history and Back would bounce forward again.
9. **The tab state can be `"chat"` without the URL saying so** (a click on the pill before the flag answers, if a client hook is used). The phone handles this with `chatWanted` (`CampusMobile.tsx:299`). With a server-decided prop the pill is simply never drawn and this cannot happen.
10. **The Otto orb and the `100dvh` lock** are keyed on `tab === "chat"` (`campus-home.tsx:538-544`, `:906-908`). If only the pill is hidden and the state is left on chat for one frame, the orb vanishes and the page locks. Derive one shown tab and key everything on it.
11. **`/api/orgs?filter=mine` and the channels read still run on Campus** (`campus-home.tsx:650-688`, `:703-738`) for the modals. If `?manage=` opens a modal, it must wait for both (the same chain the deep link uses, `:672-681`, `:721-733`); opening it before `activeOrg` exists renders nothing (`:1049`, `:1065`).
12. **"Who can post" for an extra room does not exist.** The database rule is fixed by kind: Board = owner or admin for a new post, any member for a reply; event = until 7 days after it ends; Lounge, Officers and extra rooms = everyone who can see the room (`supabase/migrations/20261001100000_chat_v2_rooms.sql:1362-1394`). "Who can see" for an extra room is only public (all members) or private with a by-name list (`ChannelAccess`, `campus-home.tsx:3582`; core rooms answer `room_locked`, `api/orgs/[slug]/channels/[channelId]/route.ts:99-104`). Point 11's "only some people can post" needs a new column or table AND a new body for `can_post_org_channel`, whose text the rooms migration checks by md5 in its own post-check (`:1710-1721`) and which `scripts/sql/chat-v2-rooms-check.sql:741-746`, `:796-797` exercises. The old screens know only two "cannot post" sentences (`campus-home.tsx:16755-16756`); a new reason needs a sentence that old screens can show too.
13. **"Pinned" already means two other things.** A chat pinned to the top of your inbox (`channel_members.pinned_at`, `api/me/threads/route.ts:85`, `:561`) and a room pinned in the club rail (`channels.pinned`, `campus-home.tsx:219`, `:15708-15714`, the "📌 Pinned" header). Pinned MESSAGES (point 10) need a name that cannot be confused in code or in copy.
14. **RSVP from the new desktop chat will not refresh My Calendar** in the left nav unless it calls `emitCalendarChanged()` (`src/components/LeftNav.tsx:18-22`, listener `:512`). Only `campus-home.tsx` calls it today (`:9995`, `:10500`, `:10549`); the phone's RSVP sheet and Event card never do, because the phone has no left nav.
15. **A push for a club-chat mention lands on the club page, not the room** (`payload.ts:400-411`), and its event carries no room id (`payload.ts:209-216`). Do not "fix" the address without the id; `payload.test.ts:354` pins it.
16. **Otto's chat-mention row has no room id either** (`api/me/notifications/route.ts:51` selects `message_id` only). `OttoSidePanel.tsx:961` and `_otto.js:881` cannot open the room without a server change.
17. **`ChannelsSection.tsx` serves phone and desktop.** Changing its href to `/messages?channel=` for everyone would send flag-off people into the old iframe, where Officers and private rooms are not listed (`api/me/threads/route.ts:435-445` builds the list from `channel_members` rows; audit M8) and the page says "Couldn't open that conversation" (`messages.html:3654-3660`).
18. **The chat bubble's Expand** (`_miniMessenger.js:580`) renders `/messages?to=` with an EMPTY handle when the peer has none. Fix it with the thread id, not the peer.
19. **Android tablets and foldables 900px or wider get the desktop tree inside the app** (`use-is-mobile.ts:14`; `handoffs/s72-prep/notes/desktop-chat.md:66`). With the switch on they get the new desktop page. Walk one tablet width.
20. **Walk traps on record** (`handoffs/2026-10-02-session-71-close-and-next-up.md:124-130`; memory "Browser pass is not optional"): the dev server can serve stale code (touch the file, re-warm, re-run before "fixing"); a magic link does not switch accounts when someone is signed in (use `cookie.mjs`, and prove who is signed in with `GET /api/me/profile-bootstrap`); never leave a staged cookie file in `public/`; the first click after a navigation in the browser pane only focuses the tab; the console keeps old errors from a half-saved edit (reload first); a "stalled" agent is usually the Mac asleep (keep `caffeinate` running); Turbopack refuses a symlinked `node_modules` in a worktree (`cp -cR`); a new worktree needs its own `.env.development.local`; never `REVOKE EXECUTE` on a public function on this Postgres image.
21. **The seed's clock.** Event chat states depend on the day the seed ran (`local-seed.mjs:26-34`). A walk on a later day finds "live" events ended and closed rooms that were open.
22. **`npm test` only finds `src/**/*.test.ts`.** A test written beside a tool under `handoffs/` does not run in the gate.

## 6. Open questions for the planner, each with a recommended answer

1. **Where does a laptop learn the desktop switch: a client hook, or the server page?**
   Recommend the server page. `src/app/messages/page.tsx` and `src/app/campus/page.tsx` are server components that already run `enforceCampusAccess`; they can ask the desktop answer for the signed-in user and pass one boolean prop down (`MessagesSwitch`, `CampusSwitch` -> `CampusHome`). Result: no `null` state on desktop, no skeleton for people without the switch (their screens stay byte for byte), no wasted iframe load for people with it, and traps 2, 9 and 10 disappear. Also expose the key on `GET /api/me/features` for the static pages. The contract must say this is a second way in, since `.env.example:175` says the features route is the only one.

2. **How does the desktop switch relate to `chat_v2`?**
   Recommend: desktop is on for a person only when `chat_v2` is on for that person AND the desktop switch says yes (`CHAT_DESKTOP_ENABLED=true`, plus an optional `CHAT_DESKTOP_ALLOWLIST` with the same star and id rules). The new page reads routes that 404 without `chat_v2` (4.1). On Oct 26 the phone goes to `*` and the desktop list stays the founders until the go / no-go. Written in `flag.ts` with tests in `flag.test.ts`.

3. **How do officers reach club settings and room management once the rails are gone?**
   Recommend the address door: "Manage club" in the club panel links to `/campus?manage=<handle>` and `CampusHome` opens `OrgSettingsModal` (its Channels tab is the rooms door); a room's own settings open with `&room=<id>`, a new room with `&new_room=1` (section 3.3). About 30 lines, no code moved. Rename the words inside those modals for switch-on people only if the batch has room ("Channels" -> "Rooms", "Create a channel" -> "New room"); the old words are otherwise a known after-launch item. The new "who can post" control goes in `CreateChannelModal` and `ChannelSettingsModal`'s Access tab, for extra rooms only.

4. **Should the Otto "mentioned you in a chat" row open the room?**
   Recommend yes, small: `GET /api/me/notifications` adds `channel_id` for rows with a `message_id` (looked up with the service client after the main read, the way club rows are attached, and only for rooms the viewer can still read), and `OttoSidePanel.tsx:961` + `_otto.js:881` go to `/messages?channel=<id>` when it is present, else bare `/messages`. This is a change to an existing route, not a new one, and it is flag-independent (it adds a freeze-list row). On an old desktop an event-chat id still dead-ends (audit I3), so send the id only for people with a switch on, or accept bare `/messages` for this build and list it as owed. If time is short: owed.

5. **Should the push for a club-chat mention open the room instead of the club page?**
   Recommend no change in this build. The push event has no room id (`payload.ts:209-216`), the address is pinned by a test with the reason written in it (`payload.test.ts:354`), and a push cannot know whether it will be opened on a device with the new chat. Revisit when everyone has the new chat on every screen.

6. **The chat bubble on the profile page: what changes?**
   Recommend one flag-independent line: Expand goes to `/messages?channel=<thread id>` for anything that is not a DM (`_miniMessenger.js:580`); it fixes audit M3 on that surface for everyone and is right on both the old and the new Messages. Do not make the bubble flag-aware in this build. It adds one row to the freeze list, so it lands before Oct 15 or waits.

7. **Do the owed old-screen fixes ride with this build?**
   Recommend a separate small batch, before the desktop screens, for the ones that still matter without the switch (section 1.9): M3 server fix (`peer: null` unless `dm`), M4 (hide Clear on club rooms, refuse in the route), M5 (`/read` in `ChannelChat`). They touch `campus-home.tsx`, `messages.html` and `threads/route.ts`, the same files the desktop batches own, so doing them first avoids two batches editing one file. M8 and I3 are not worth building on screens that are being replaced: accept them for flag-off laptops until the switch goes to everyone. M2 is its own migration and its own yes from Franky.

8. **Which batch owns `campus-home.tsx`?**
   Recommend exactly one batch for the whole build: the tab removal, the redirect, the `?manage=` door, and (if question 7 is yes) M5. The file is 17,286 lines; cap each edit at about 150 lines and never read it whole.

9. **`/messages?to=<handle>` on the new page.**
   Recommend the shell resolves it in React the way the phone does (`MessagesMobile.tsx:424-434`), opens the DM, and replaces the address with `/messages?channel=<id>`. The thread-only iframe then only ever receives `channel=`.

10. **What does a room you can see but cannot post in say, for the new restricted rooms?**
    Recommend one new refusal code and sentence beside `board_officers_only` and `room_closed` (the codes are `RefusalCode` and the words are `REFUSAL_SENTENCES`, `src/lib/chat/types.ts:123-137`: "Only officers post here.", "This chat is closed."; `postRefusal` in `src/lib/chat/room-rules.ts:112` picks the code; old desktop shows them at `campus-home.tsx:16755-16756`), so old screens show a true line too. The exact words are the copy owner's call; the map only notes that old desktop falls back to `room_closed` ("closed") for any reason that is not the Board, which would be wrong for a posting-restricted room.

11. **Walk plan.**
    Recommend: 1440, 1280, 1024 and 900px wide, then 899px (the phone tree must appear, unchanged), Light and Night, as blake (member), avery (owner), casey (mod), and one account with the desktop switch off; `sae` for the extra room and Officers, `chat_seed_club` for cards and the three event-chat states; re-run the seed that day; then the phone list at 375px again with `chat_v2` on and with it off.

## Addendum: two facts found while checking point 11 (for whoever maps the club space)

- `GET /api/orgs/[slug]/space` already returns EVERY room the viewer may see, extra rooms included: it reads `channels` for the club on the viewer's own client, so the database's access rule leaves out what they cannot enter (`src/app/api/orgs/[slug]/space/route.ts:147-151`, `:174`, `:241-265`). Each room carries `can_post` (`:251`, from `spaceCanPost(kind, role, state)`: computed from the KIND, not from a per-room setting).
- `SpaceRoom` (`src/lib/chat/types.ts:415-422`) has `id, kind, name, unread, can_post, event`. It has no `is_private`. The Officers chip can draw its lock from `kind`, but a private EXTRA room cannot be told apart from a public one with today's answer. The lock mark for restricted extra rooms needs one more field on that route (the select at `route.ts:151` does not ask for `is_private`), and `reads-routes.test.ts:651` checks that route field by field.
