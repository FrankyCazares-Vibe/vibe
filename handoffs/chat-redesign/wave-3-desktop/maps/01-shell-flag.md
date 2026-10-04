# Map 01: the page shell, the switch, and URL state

Read Sat Oct 3, 2026, on branch `chat-desktop` (same commit as main, `e7869b9`). Read-only. Every path is from the repo root. Line numbers are today's.

**Short answer**
- `/messages` on a laptop is one file, 68 lines: `MessagesSwitch.tsx` picks phone or desktop by window width and, for desktop, drops an iframe of `messages.html` into the app shell. It never asks any flag.
- The `chat_v2` flag is three small files plus one route. A second, separate desktop switch can copy it almost line for line. It must also require `chat_v2`, because the routes the new screens read are gated by `chat_v2` on the server.
- The phone keeps what is open in the address (`?channel=<id>`) and in the history entry's state (`{ vibeChat, depth }`). The pure helpers for that are reusable. The 350 lines that drive them live inside the phone component and are not exported: the desktop needs its own, simpler twin.
- Five things will bite: the server always renders the desktop tree first (so a phone mounts it for one frame); the old iframe page deletes `?channel=` from the top address; changing an iframe's `src` adds a Back step; the inner chat pieces push their own history entries; a server prop goes stale after any history write.

The older notes (`handoffs/s72-prep/notes/desktop-chat.md`, `handoffs/s72-prep/desktop.md`) were checked against the code. Their file references for this area still hold. Two of their proposals need a change, both in section 6: "flag unknown -> skeleton" on desktop (Q2) and "`chat_v2_desktop` as its own answer" (Q1).

---

## 1. What exists

### 1.1 The page (server): `src/app/messages/page.tsx` (37 lines)
- `MessagesPage({ searchParams })`, `searchParams: Promise<{ to?, channel? }>` (`:10-15`, `:24`). In this Next the prop is a promise and must be awaited (`node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/page.md:117-119`).
- Calls `enforceCampusAccess("/messages")` (`:25`): signed in, Terms accepted, school email verified, onboarding done, else a redirect with `next=` (`src/lib/auth/campus-access.ts:19-49`). It returns nothing (no user object).
- Lower-cases `?to=`, trims `?channel=`, passes both to `MessagesSwitch` as `initialHandle`, `initialChannelId` (`:26-35`). `?tab=` is not read here; the phone reads it on the client.
- Reading `searchParams` makes the page render per request (page.md:119). No `Suspense` is needed around `useSearchParams` for that reason (use-search-params.md:82-88 applies only to prerendered routes).

### 1.2 The switch: `src/app/messages/MessagesSwitch.tsx` (68 lines, client)
- `MessagesSwitch({ initialHandle?, initialChannelId? })` (`:19-25`).
- `useIsMobile()` true -> `<MobileShell><MessagesMobile .../></MobileShell>` (`:28-36`).
- Otherwise builds `/html/messages.html?app=1&embedded=1[&to=][&channel=]` (`:39-42`) and renders `<CampusAppShell><iframe className="vibe-messages-iframe" .../></CampusAppShell>` (`:43-66`).
- Iframe style, all of it load-bearing for Night (`:49-64`): `width: 100%`, `height: 100vh`, `background: var(--cream)` (so the wait is not a cream flash in Night), `colorScheme: "normal"` (so Chrome does not paint a white canvas behind a dark document while it loads).
- `src` is built from props that never change after the first render, so today the iframe navigates exactly once.

### 1.3 The 900px rule: `src/lib/use-is-mobile.ts` (56 lines)
- `MOBILE_BREAKPOINT_PX = 900` (`:14`); the query is `(max-width: 899px)` (`:16`).
- `useIsMobile(): boolean` through `useSyncExternalStore` (`:54-56`). It follows the window live: crossing 900px swaps the whole tree.
- **Server snapshot is `false`** (`:36-38`): the server and the first client render during hydration always produce the DESKTOP tree. A phone swaps after hydration (the file's own note, `:46-52`).
- The same number is in CSS: `.vibe-app-shell` collapses at `max-width: 899px` (`src/app/globals.css:2804-2819`).
- Other callers of the same hook: Campus, Network, Profile, Otto switches, the toast host (`grep useIsMobile()`: 9 files). A different pattern exists for onboarding: `OnboardingSwitch.tsx:44-52, 81-86` reads the viewport once, with a `null` server snapshot and a neutral shell during hydration.

### 1.4 The `chat_v2` flag, end to end
| Piece | What it does | Where |
|---|---|---|
| `chatV2MayRunHere(env)` | true only on the live site (`VERCEL_ENV === "production"`) or in `next dev` (`NODE_ENV === "development"`). A Vercel Preview, `next start`, a bare test run: false | `src/lib/chat/flag.ts:46-48` |
| `chatV2Enabled(env)` | `CHAT_V2_ENABLED === "true"` exactly, AND may run here | `flag.ts:54-56` |
| `chatV2Everyone(env)` | switch on and `CHAT_V2_ALLOWLIST` is exactly `*` | `flag.ts:63-66` |
| `chatV2ListedUser(id, env)` | switch on and the id is in the comma list (trimmed, lower-case); blank list = nobody | `flag.ts:73-81` |
| `chatV2ClubIds(env)` | switch on: the uuid-shaped entries of `CHAT_V2_CLUBS`, each once | `flag.ts:90-98` |
| `chatV2For(userId): Promise<boolean>` | the one question: enabled AND (everyone OR listed OR member of a listed club). The club part is one `org_members` read with the service role. Fails closed, logs once, not cached | `src/lib/chat/flag-server.ts:75-108` (`server-only`, `:25`) |
| `GET /api/me/features` | `{ ok: true, chat_v2: boolean }`, 401 signed out, `private, no-store`, no 500 of its own | `src/app/api/me/features/route.ts:24-36` |
| `FeaturesResponse` | `{ ok: true; chat_v2: boolean }` | `src/lib/chat/types.ts:178` |
| `useChatV2(): boolean \| null` | one GET per mount, `null` until answered, `true` only for `{ ok: true, chat_v2: true }`, anything else `false` | `src/lib/chat/use-chat-v2.ts:30-58` |
| env docs | three commented lines, "PRODUCTION ONLY, never NEXT_PUBLIC_, never on Preview", "a changed value applies from the next deploy", "A screen learns its answer from GET /api/me/features, nowhere else" | `.env.example:169-188` |
| tests | 17 tests on `flag.ts` (the switch, where it counts, the star, the lists); `flag-server.ts` has none (it is `server-only`) | `src/lib/chat/flag.test.ts:52-195` |

Every caller (`grep -rn "chatV2For(\|useChatV2()" src`):
- Server, hard gate (404 `not_found` when off): `src/app/api/me/inbox/route.ts:79`, `src/app/api/orgs/[slug]/space/route.ts:101`, `src/app/api/me/threads/[id]/cards/route.ts:73`, `src/app/api/me/threads/[id]/cards/[messageId]/vote/route.ts:58`.
- Server, soft gate: `src/app/api/me/calendar/route.ts:116` (off -> each plan's `org_id`, `room_id`, `room_state` are null, so Your week cannot open a room).
- Server, the answer itself: `src/app/api/me/features/route.ts:34`.
- Client: `src/components/mobile/MessagesMobile.tsx:70` (the three-way fork: `null` -> `FlagPending` `:81-127`, `true` -> `MessagesMobileV2` `:213`, `false` -> `MessagesMobileV1` `:576`) and `src/components/mobile/CampusMobile.tsx:196` (drops the Chat tab `:198-205`, redirects `?tab=chat` / `?channel=` to `/messages` with one `router.replace` `:307-311`, mounts nothing of the old chat while unknown `:299-300`).
- Desktop: no caller. `MessagesSwitch.tsx`, `campus-home.tsx`, `messages.html`, `_miniMessenger.js` never ask.
- Local env on this Mac has `CHAT_V2_ENABLED` and `CHAT_V2_ALLOWLIST` set, no `CHAT_V2_CLUBS` (names only, `.env.development.local`).

### 1.5 The app shell and the left nav
- `CampusAppShell({ children, sidebar? })` (`src/components/campus-app-shell.tsx:33-50`): a div `.vibe-app-shell` holding `<LeftNav />`, the children, an optional right rail, `<MobileTabBar />` (CSS hides it at 900px and up, `globals.css:2853-2855`) and `<OttoCorner />`. **The Otto orb is hidden when the path starts with `/messages`** (`:35`).
- CSS: `.vibe-app-shell { display: grid; grid-template-columns: 200px 1fr; min-height: 100vh }` (`globals.css:2774-2778`). The content column has no `min-width: 0` and no fixed height of its own; today the iframe supplies `height: 100vh`.
- `LeftNav()` (`src/components/LeftNav.tsx:167-390`): `<aside class="vibe-left-nav-aside">`, sticky, `height: 100vh`, own scroll (`:236-243`). Items: Campus, Network, Messages, otto, Settings (`:25-154`). Active = `pathname === href` or starts with `href/` (`:296-299`), so a `?channel=` change never moves the highlight. Then the identity chip (`:377`) and **My Calendar** = `<CalendarWidget />` (`:387`, defined `:451`).
- My Calendar reads `GET /api/me/calendar` on mount (`:486-504`) and again whenever anything fires the window event `vibe:calendar-changed` (`CALENDAR_CHANGED_EVENT`, `emitCalendarChanged()`, `:18-23`, listener `:508-514`). Today only desktop Campus fires it (`campus-home.tsx:9995, 10500, 10549`). The phone chat's RSVP sheet does not.
- `MobileShell` (`src/components/mobile/MobileShell.tsx:25-39`): phone only; bottom padding for the tab bar.
- Root layout mounts `ThemeSync`, `CustomCursor`, `NativeBridge` for every page (`src/app/layout.tsx:106, 113, 123`).

### 1.6 How the phone keeps its state in the URL and history
The contract is `handoffs/chat-redesign/wave-2-contracts.md` 2.3 (`:172-187`) plus the S71 amendments described in the file headers below.

URLs (phone, flag on): `/messages` (home, All), `/messages?tab=chats|clubs|requests` (`homeUrl`, `parseHomeFilter`, `src/components/mobile/messages/home/home-rules.ts:21-33`), `/messages?channel=<id>` (any room or thread the viewer may read), `/messages?to=<handle>` (a DM).

History entry state: `{ vibeChat: <id>, depth: 1 }` for a club space or a DM, `depth: 2` for the event chat layer over a space, plus `sheet: n` for each sheet, tray or confirm on top (`src/lib/chat/layer-stack.ts:7-10, 79-101`).

Pure helpers (no DOM, tested in `layer-stack.test.ts`):
- `readMarks(state): { vibeChat, depth, sheet }` (`layer-stack.ts:85-96`).
- `channelOfEntry(search, state): string | null`: `?channel=` in the address, else a depth >= 1 state (`:107-117`).
- `arrivalWrites(state, id, eventRoom): "none" | "space" | "space+layer"` (`:130-134`); `spaceEntryNamesLayer`, `spaceEntryAfterLayer` (`:153-161`): phone-only, about the depth-2 layer.
- `createLayerStack(env)` (`:165-406`): the sheet stack.

Page glue (`src/lib/chat/use-layer-history.ts`, 140 lines): ONE stack per page at module level (`:50-80`), with its own `popstate` listener.
- `useLayerHistory(open, onPop, canPop?)` (`:121-140`): a sheet pushes one entry while open; Back calls `onPop`.
- `isLayerPop(e)` (`:92-94`): true = this `popstate` was a sheet closing; the room owner does nothing.
- `clearLayersThen(fn)` (`:97-101`), `clearLayersInto(write)` (`:110-114`): every room-level history write goes through one of them, so an open sheet is closed first.
- `adoptLayerEntry()` (`:117-119`): on mount, steps off a leftover sheet entry.

The driver, inside the phone component and NOT exported (`src/components/mobile/MessagesMobile.tsx:213-569`, `MessagesMobileV2`):
- `openView(view)` (`:260-286`): from the home a `pushState`, with a view already open a `replaceState`; always `{ vibeChat: id, depth: 1 }` and `/messages?channel=<id>`.
- `closeLayer()` (`:311-331`): `history.back()`, or `closeInPlace()` (`:300-308`) when nothing is behind the entry (a fresh tab from a push tap), with a 600 ms fallback (`:175, 326-329`).
- `openFromEntry(id)` (`:340-392`): one `GET /api/me/threads/<id>/messages?limit=50` decides the view: `room !== null` -> a club space (`room.org.handle`, `room.kind`), else a DM/group thread; the body is reused as the room's first page. A failure -> home on All, URL back to `/messages`, a toast (`:358-366`).
- The `popstate` handler (`:394-422`): skips sheet pops, re-opens what a restored entry names, closes on depth 0.
- On mount (`:470-485`): what is open is read from the LIVE entry (`window.location.search` + `history.state`), never from the server prop; `initialChannelId` is only the fallback when the address cannot be read (`:221-223`, `:148-162`).
- `?to=` (`:425-464`): an existing DM in the list, else `POST /api/me/threads { handle }` -> `{ channel_id }`.
- Inside a space, `ClubSpace` owns its own `popstate` handler and the depth-2 writes (`src/components/mobile/messages/club/ClubSpace.tsx:112-149, 317-360, 364-407`); a chip tap is `replaceState` at the same depth (`:116-125, 394-406`).
- Android's hardware Back is `window.history.back()` (`src/components/native/NativeBridge.tsx:172`).

### 1.7 Where the old desktop page touches its parent window
`public/html/messages.html` (3,755 lines) with `public/html/_persistence.js`:
- `?embedded=1` adds `body.vibe-embedded` (`_persistence.js:112-126`), which hides the page's own left nav and sets its grid to `300px 1fr` (`messages.html:29-30`).
- **It rewrites the TOP window's address.** After opening `?to=` or `?channel=` it deletes that parameter from the parent URL with `window.__vibeTopReplaceState({}, '', url)` (`messages.html:3632-3639`, `3662-3668`), which is `window.top.history.replaceState` (`_persistence.js:147-155`). The state it writes is `{}`.
- A `?channel=` that is not in its own list shows "Couldn't open that conversation" (`messages.html:3653-3660`).
- Links that leave the page go through `window.__vibeTopNav(url)` = `window.top.location.href = url`, a full page load of the parent (`_persistence.js:134-146`).
- Sign-in and Terms links use the top window's path (`_vibeTopHere`, `_persistence.js:161-167`).
- Mouse position is posted to the parent for the custom cursor (`messages.html:1120-1129`); the parent finds the iframe by `event.source` and offsets by its rectangle (`src/components/CustomCursor.tsx:128-164`), so an iframe that is narrower or moved still works.
- Theme: its own boot script sets `data-theme` before paint from `localStorage.vibe_theme` (`messages.html:4`); it follows a later change through the `storage` event and the OS flip (`_persistence.js:95-107`). The React side does the same (`src/lib/theme/ThemeSync.tsx:35-64`). A drift test pins the boot script in `messages.html` (`src/lib/theme/theme.test.ts:231-254`).
- Timers: the open thread every 2 s (`messages.html:1791, 2575-2579`), the list every 30 s (`:3671-3674`), both skip while the document is hidden.
- It never calls `history.pushState` or `replaceState` on its own window (grep: only the two top-window calls above).
- `openT(id)` opens a thread that is already in its list (`messages.html:1152-1159`).

### 1.8 The proxy: `src/proxy.ts` (330 lines)
- This Next calls middleware "proxy"; the file must sit in `src/` (`proxy.ts:7-14`; proxy.md:10).
- No rule names `/messages`. The page is covered by the general rules: session refresh (`:223`), and a suspended or banned account is sent to `/account/suspended` from every page (`:239-249`).
- Rules for the static page: `/html/messages.html` maps to the clean route `/messages` (`:38`) and is one of the two "app" pages (`:50`). Signed out -> login with `next=/messages` (`:293`). Signed in WITH `?app=1` -> served (`:294`). Signed in WITHOUT `?app=1` -> redirect to `/messages`, **query dropped** (`:295-298`, `redirectTo` only carries what it is handed, `:207-216`).
- The matcher skips images and `_next` only (`:326-330`); `.html` and `.js` under `/html/` do pass through it.
- `next.config.ts:85` sends `X-Frame-Options: SAMEORIGIN`, so the app may frame its own pages (the note at `:77-84` says why).

### 1.9 Campus > Chat, as far as the shell cares
- `src/app/campus/page.tsx:10-18`: `enforceCampusAccess("/campus")`, then `<CampusSwitch showSchoolVerifiedBanner=... />`. The page types only `school_verified` in `searchParams` (`:13`).
- `src/app/campus/CampusSwitch.tsx:17-31`: phone -> `CampusMobile`, desktop -> `CampusHome`.
- Desktop `CampusHome` reads `?tab=`, `?org=`, `?channel=` once, on the client, with `useSearchParams` (`src/app/campus/campus-home.tsx:469-499`, `parseInitialTab` `:182-187`); the Chat tab is declared at `:178, :377, :385`; it hides the Otto orb with a body class while on Chat (`:539-545`).
- The club page links rooms to `/campus?tab=chat&org=<handle>&channel=<id>` (`src/app/orgs/[handle]/ChannelsSection.tsx:314`).
- Links INTO `/messages` from elsewhere: `/messages?channel=<id>` from push (`src/lib/push/payload.ts:322`), from Campus (`campus-home.tsx:10763, 10790`, a full `window.location.href`), from Network (`src/components/network/UserCard.tsx:452`), from the profile page (`public/html/profile.html:11345-11346`); `/messages?to=<handle>` from the profile page and the mini messenger (`profile.html:6901, 7378`, `_miniMessenger.js:580`); a bare `/messages` from Otto (`src/components/network/OttoSidePanel.tsx:961`).

### 1.10 What this Next (16.3.4, React 19.2.4; `package.json:31-34`) does that the shell relies on
- `window.history.pushState` / `replaceState` are supported and patched: they keep `usePathname` and `useSearchParams` in step (`node_modules/next/dist/docs/01-app/01-getting-started/04-linking-and-navigating.md:343-347`). The patch copies Next's own marks (`__NA`, the router tree) onto the state you pass and, when a URL is given, updates the router's URL; it does NOT re-run the server page (`node_modules/next/dist/client/components/app-router.js:84-96, 237-281`).
- A `popstate` onto an entry whose state has no `__NA` makes Next **reload the page** (`app-router.js:284-293`).
- `router.push` / `router.replace` to `/messages?channel=...` is a real navigation: the server page runs again (`enforceCampusAccess`, two database reads) on every call.
- Server page props do not follow history writes. After a link out and Back, Next restores the page it rendered for the FIRST address while the address and state are the room's (the phone's note, `MessagesMobile.tsx:148-153`).
- `useSyncExternalStore` during hydration uses the server snapshot and only compares with the real one in a passive effect (`node_modules/next/dist/compiled/react-dom/cjs/react-dom-client.development.js:8438-8449, 8469-8483`). So on a hard load the desktop tree is committed, its children's mount effects run, and only then does a phone swap.

---

## 2. Reusable on desktop AS IS

| Piece | Why it is safe |
|---|---|
| `page.tsx`'s gate and its two props (`:25-35`) | Viewport-blind. A desktop shell gets `initialHandle` / `initialChannelId` for free. |
| `CampusAppShell` + `LeftNav` + My Calendar (`campus-app-shell.tsx:33-50`, `LeftNav.tsx:167-390`) | Design point 1 says the nav stays exactly as today. Keep rendering the new page as the shell's child and nothing in the nav changes. The Otto orb stays hidden on `/messages` for free (`:35`). |
| `useIsMobile` + the 900px number (`use-is-mobile.ts:14, 54-56`) | The rule the design names ("900px wide or more"). No change. |
| `flag.ts`'s shape: exact `"true"`, the star as the whole value, blank = nobody, uuid-only club entries, `chatV2MayRunHere` (`:46-98`) | The pattern to copy for the second switch. `chatV2MayRunHere` can be called as is by the new switch (it is exported and env-only). |
| `chatV2For` (`flag-server.ts:75-108`) | The desktop answer must include it (trap 5.9). Call it; do not copy it. |
| `GET /api/me/features` (`route.ts:24-36`) | Adding a field is safe: `useChatV2` checks only `ok === true && chat_v2 === true` (`use-chat-v2.ts:26-28`); no test pins the body. |
| `useChatV2` (`use-chat-v2.ts:30-58`) | Untouched. The phone keeps asking it. |
| `channelOfEntry`, `readMarks` (`layer-stack.ts:85-117`) | Pure, tested. They answer "what does this entry say is open" for any shell. |
| `isLayerPop`, `clearLayersThen`, `clearLayersInto`, `adoptLayerEntry`, `useLayerHistory` (`use-layer-history.ts:92-140`) | One stack per page whoever mounts it. A desktop shell MUST use them (trap 5.5), and may use `useLayerHistory` for its own dialogs so Back closes a dialog first. |
| `homeUrl`, `parseHomeFilter`, `HomeFilter` (`home-rules.ts:21-33`) | Pure. Same `?tab=` on both screens. |
| The entry mark `{ vibeChat: <id>, depth: 1 }` and the URL `/messages?channel=<id>` | Same shape on desktop means a window dragged across 900px, a push link and a pasted link all mean the same thing to both trees. |
| The resolving read `GET /api/me/threads/<id>/messages?limit=50` -> `room` or no `room` (`MessagesMobile.tsx:352-370`) | Not gated by any flag, works for every thread the viewer may read; it tells a club room (and its kind and club handle) from a DM or group. |
| `RoomKind = "board" \| "lounge" \| "officers" \| "event" \| "room"` (`src/lib/chat/types.ts:22`) and `ThreadRoom` (`:322-327`) on the resolving read | Design point 11 (every room a club has, exec-only and extra rooms included) needs no new URL shape: `/messages?channel=<roomId>` already names any room, and the read answers 403 for a room the viewer may not see, which the shell turns into "home + toast". |
| `POST /api/me/threads { handle }` -> `{ channel_id }` for `?to=` (`MessagesMobile.tsx:434-446`) | Same call on desktop. |
| `useNightTheme` (`src/components/mobile/messages/theme.ts:22-28`) | Reads `data-theme` and the `vibe:theme` event; not phone-shaped. |
| The iframe's four style lines (`MessagesSwitch.tsx:49-64`) | Copy them onto the thread-only iframe unchanged; they are what stops the white flash in Night. |
| `emitCalendarChanged()` (`LeftNav.tsx:19-23`) | The way to tell My Calendar that an RSVP changed in the new page. |

---

## 3. Phone-shaped: what needs a wrapper or a desktop twin

| Piece | Why it is phone-shaped | Smallest way |
|---|---|---|
| `MessagesSwitch`'s desktop branch (`:39-66`) | One fixed answer: the full old page in an iframe. | Add ONE prop (the desktop switch's answer, section 6 Q2). Off: lines `:39-66` run exactly as today. On: `<CampusAppShell><MessagesDesktop .../></CampusAppShell>`. The phone branch (`:28-36`) is not touched. |
| The open-state driver `MessagesMobileV2` (`MessagesMobile.tsx:213-569`) | Not exported, and built around one full-screen layer over the home: `ClubSpace` drawer, `ConversationView`, `closeLayer` via `history.back()`, the depth-2 event layer. | A desktop twin hook in a new file (say `src/components/desktop/messages/use-desktop-open.ts`) built on the reusable helpers of section 2. It is simpler than the phone's: no depth 2. Do NOT extract the phone's code into a shared hook in this build; that file was walked on a real phone days ago. |
| `ClubSpace`'s history code (`ClubSpace.tsx:112-149, 317-407`) | Owns the depth-2 event layer and its own `popstate` handler. | Not mounted on desktop. The desktop club pane writes `replaceState({ vibeChat: roomId, depth: 1 }, "", "/messages?channel=<roomId>")` on every chip click, event chips included (design point 7: an event chat is a selected chip, not a layer). |
| `FlagPending` (`MessagesMobile.tsx:81-127`) | A phone header and list skeleton. | Desktop needs no pending screen if the answer arrives as a prop (Q2). It still needs a neutral placeholder for the one render before the client is known (trap 5.1). |
| `MessagesHome` (`home/MessagesHome.tsx:327`, props `:59-71`) and its private `useHomeData` (`:77`) | The reads and the list are one component with phone layout numbers; the hook is not exported. The desktop needs the same data in two shapes (wide list at home, slim list with a chat open) without reading twice. | Another reader's area. For the shell: the list data must live ABOVE the open/closed fork so going home and opening a chat do not re-read; `refreshKey` and `onThreads` (`:62-65`) show what the shell and the list exchange today. |
| `messages.html` as a whole page | List + thread + its own URL clean-up. | A thread-only mode behind a new query flag (say `pane=1`), always with `app=1&embedded=1`. In that mode: hide the list column, skip the two top-URL rewrites (`:3632-3639, 3662-3668`), and stop the 30 s list timer if the list is not shown. The details are the DM reader's; the shell's needs are in traps 5.2 to 5.4. |
| `useHideTabBar` (`src/lib/chat/use-hide-tabbar.ts:25-35`) | Adds `body.vibe-composer-open`. | Harmless on desktop: the only rule using that class sits inside `@media (max-width: 899px)` (`globals.css:2856-2880`). No wrapper needed. |
| `.vibe-app-shell`'s content column (`globals.css:2774-2778`) | No `min-width: 0`, no height; fine for one iframe, not for a three-part layout with its own scrolling panes. | The new page's root sets `min-width: 0; height: 100vh; overflow: hidden` itself. Do not edit the shared class (five other pages use it). |
| `.vibe-messages-iframe` (`globals.css:3022-3034`) | Carries phone-only height rules under 760px. | Give the thread-only iframe its own class or none; it fills its pane (`height: 100%`), not `100vh`. |

---

## 4. Contracts the desktop build must not break

**The switch off = today, byte for byte.**
1. With the desktop switch off, `MessagesSwitch` must render `:43-66` unchanged: same `src` (`/html/messages.html?app=1&embedded=1` plus `to` / `channel`), same class, same four style lines, inside `CampusAppShell`. No extra request, no skeleton, no later start of the iframe load.
2. The phone branch (`MessagesSwitch.tsx:28-36`) and everything under `src/components/mobile/` behave the same whatever the desktop switch says. The only phone change in this build is behind `chat_v2` (the pin actions).
3. `messages.html` loaded WITHOUT the new thread-only flag behaves exactly as today (it is still the whole desktop page for everyone without the switch, and `/html/messages.html?app=1` is reachable directly).

**Flag rules (copy, do not bend).**
4. `flag.ts` stays pure: no imports, erasable TypeScript only, every function takes `env` (`flag.ts:5-8`); `flag.test.ts` imports it by path with `node --test` (`flag.test.ts:18-21`). The existing five exports keep their names and results (17 tests, `:52-195`).
5. The switch comes first in every reader; exactly `"true"`; never `NEXT_PUBLIC_`; only on the live site and in `next dev` (`flag.ts:18-22, 46-56`; test `:98-101`). A Preview build must do nothing even with the variable set.
6. Blank or unset list = nobody; `*` must be the whole value (`flag.ts:63-81`).
7. The per-person answer fails closed and is never cached (`flag-server.ts:12-16`).
8. `FeaturesResponse` may gain fields; `chat_v2` keeps its name and meaning (`types.ts:178`, `use-chat-v2.ts:26-28`). The route stays read-only, `private, no-store`, 401 signed out (`features/route.ts:7, 30-35`).
9. The routes gated by `chat_v2` stay gated by `chat_v2` (`inbox:79`, `space:101`, `cards:73`, `vote:58`, `calendar:116`). The desktop switch is a SCREEN switch; it adds no second gate to those routes and must not loosen them.

**URL and history.**
10. `/messages?channel=<id>`, `/messages?to=<handle>`, `/messages?tab=<filter>` keep their meaning on both screens (contract 2.3, `wave-2-contracts.md:172-180`). Push and Otto links depend on the first (`src/lib/push/payload.ts:322`).
11. The entry state keeps the shape `{ vibeChat: string, depth: number, sheet?: number }` (`layer-stack.ts:79-101`). `layer-stack.test.ts` pins the helpers. A desktop shell writes depth 1 only and reads any depth >= 1 as "open".
12. Every `popstate` owner on the new screens asks `isLayerPop(e)` first, and every room-level history write goes through `clearLayersThen` / `clearLayersInto` (`use-layer-history.ts:31-40`).
13. History writes use the TOP window's `window.history` (Next's patched functions), never a saved original and never the iframe's own.

**Shell.**
14. `CampusAppShell` and `LeftNav` are not edited. `VIBE_NAV_ITEMS` is shared with the phone tab bar (`LeftNav.tsx:156-165`).
15. `src/proxy.ts` needs no change for this build. If the thread-only iframe URL ever lacks `app=1`, the proxy bounces it to `/messages` and the pane would frame the whole app inside itself (`proxy.ts:294-298`).
16. The theme boot script inside `messages.html` is pinned by a drift test (`src/lib/theme/theme.test.ts:231-254`): any edit to that file keeps line 4 as it is.
17. `scripts/check-pwa.mjs` checks the head lines the static pages share (the `_sw.js` tag, the manifest link, `theme-color`; it fetches `profile.html` for it, `:520-541`, and the comment says `messages.html` carries the same three lines): any edit to `messages.html` keeps its head as it is. `src/lib/chat/layer-stack.test.ts` replays the phone's flows by name (`MessagesMobile.closeLayer` `:553`, `MessagesMobile.openView` `:743`): the helpers keep their behaviour.

---

## 5. Traps

**5.1 A phone mounts the desktop tree for one frame on every hard load.** The server snapshot of `useIsMobile` is `false` (`use-is-mobile.ts:36-38`), and React only notices the mismatch in a passive effect after the first commit (section 1.10). Today that costs a phone a wasted iframe load. With a new desktop shell it means the shell's mount effects (the reads, `adoptLayerEntry()`, `replaceState` on arrival) would run ON THE PHONE, then the phone's own shell would run them again: two resolving reads and possibly two history writes for one push tap. Fix: the new desktop page must not mount on the server or during hydration. Render a neutral placeholder until the client is known (the `OnboardingSwitch.tsx:44-52, 81-86` pattern: a store with a `null`/`false` server snapshot), then mount. The flag-off iframe branch keeps today's behaviour.

**5.2 The old page deletes `?channel=` and `?to=` from the top address** and writes `{}` as the state (`messages.html:3632-3639, 3662-3668`; `_persistence.js:147-155`). Inside a desktop shell that would (a) lose the open chat on refresh, (b) wipe the `{ vibeChat, depth }` mark, so Back and Forward would misread the entry. The thread-only mode must skip both rewrites.

**5.3 Changing an existing iframe's `src` adds a step to the tab's Back history.** Today the `src` never changes (section 1.2). If the shell switches DMs by changing `src`, Back would walk the iframe back through earlier chats while the address bar says something else. Use one of: remount the iframe with `key={threadId}` (by the HTML rules a new iframe's first load replaces its blank entry and adds none; read, not seen in a browser, so walk Back after three switches; costs a full load of `messages.html` and its 9 scripts per switch), or `iframe.contentWindow.location.replace(url)`, or keep one iframe and tell it to open another thread with `postMessage` (fastest; needs a small listener in the page that calls `openT`, `messages.html:1152`, which only knows threads already in its list). The planner must pick one and write it down.

**5.4 The thread-only URL must carry `app=1`.** Without it a signed-in request is redirected to `/messages` with the query dropped (`proxy.ts:295-298`): the pane would load the whole app inside itself. Signed out, it redirects to login inside the frame (`:293`).

**5.5 The reused inner pieces push history entries by themselves.** `useLayerHistory` is called by the Board's report sheet (`club/BoardView.tsx:80`), the "+" tray (`club/RoomComposer.tsx:171`), the remove confirm and report sheet (`club/RoomThread.tsx:152, 217`), `club/RsvpSheet.tsx:48`, `home/MonthSheet.tsx:109`, `compose/CardSheet.tsx:154`. On desktop that is good (Back closes the dialog) but the shell must cooperate: skip `isLayerPop` pops, wrap its own writes in `clearLayersThen`, call `adoptLayerEntry()` on mount. A shell that calls `history.replaceState` directly while a dialog is open overwrites the dialog's entry and leaves the stack counting an entry that no longer exists.

**5.6 Never a step back followed by a new entry** without a click in between (`layer-stack.ts:40-51`): Chrome then marks the entries below as skippable and the toolbar Back jumps past the home. So "Messages" (go home) is `history.back()` when the home's entry is underneath, or a `replaceState` in place when it is not; never `back()` then `pushState`.

**5.7 Server props are stale after the first history write.** `initialChannelId` describes the first address only (`MessagesMobile.tsx:148-153, 221-223, 470-485`). The desktop shell reads `window.location.search` + `history.state` on mount and on every `popstate`.

**5.8 An entry without Next's `__NA` mark reloads the page on Back** (`app-router.js:288-292`). Entries written through the patched `window.history` get it copied automatically (`:84-96`). Entries written with a saved original function, or by a navigation inside the iframe, do not.

**5.9 The desktop switch on with `chat_v2` off is a broken page.** The inbox, the club space, the card and vote routes answer 404 and Your week has no rooms (section 1.4). The desktop answer must be `chat_v2 AND desktop`, computed on the server in one place.

**5.10 `chatV2For` is not cached** (`flag-server.ts:14-16`): for a person who is in through a club (not the allow-list) each call is one `org_members` read. A desktop home would ask through the page, features, inbox and calendar. Accepted on the phone for v1 (contract 2.1, `wave-2-contracts.md:161`); say so again or make the desktop function call `chatV2For` once and reuse its answer within the request.

**5.11 The flags do nothing on a Vercel Preview and under `next start`** (`flag.ts:46-48`). The desktop can only be walked in `next dev` on the local stack, or on production by an allow-listed account. A changed env value on Vercel needs a new deploy (`.env.example:174`).

**5.12 `enforceCampusAccess("/messages")` drops the query** (`page.tsx:25`; the helper's own note says the path should carry it, `campus-access.ts:14-17`). A signed-out person who opens `/messages?channel=<id>` comes back to a bare `/messages`. Old behaviour, both screens, any flag.

**5.13 Crossing 900px swaps the whole tree** (`use-is-mobile.ts:54-56`): a draft in the composer and any open dialog are lost. What is open survives only because it is in the address. A phone entry at depth 2 (an event chat) can become the desktop's live entry and the other way round; hence "read any depth >= 1, write depth 1" (contract 11 above). Going desktop -> phone on an event room, the phone adds its depth-2 entry (`arrivalWrites`, `layer-stack.ts:130-134`): one extra Back step, acceptable.

**5.14 Android tablets and foldables at 900px or wider get the desktop tree inside the app** (`handoffs/s72-prep/notes/desktop-chat.md:66`). With the switch on for them they get the new page; hardware Back is `history.back()` (`NativeBridge.tsx:172`), so the history rules above are what they feel.

**5.15 My Calendar and Your week are two readers of the same route.** An RSVP made in the new page updates Your week only if the page refreshes it, and My Calendar only if `emitCalendarChanged()` is called (`LeftNav.tsx:508-514`). Nothing in the phone chat calls it today.

**5.16 `router.replace` / `router.push` on `/messages` re-runs the server page** (two reads in `enforceCampusAccess`, plus the flag). Use `window.history` for every in-page move, as the phone does. `router` is right only for arriving from another page (the Campus redirect, `CampusMobile.tsx:310`).

**5.17 Two files say "desktop never asks the flag"**: the comment at `MessagesMobile.tsx:47` and contract 2.1 (`wave-2-contracts.md:159`). Both become wrong; the new contract should say which lines replace them.

**5.18 `.env.example:175` says a screen learns its answer "from GET /api/me/features, nowhere else".** If the desktop answer arrives as a server prop (Q2), that sentence needs a second clause.

**5.19 "No `room` on the resolving read" means a DM or group only because migration A gave every club channel a `kind`.** `roomOf` returns `room: null` for a club channel whose `kind` is empty (`src/lib/chat/message-read.ts:757-764`); the migration backfills `lounge` / `board` / `officers` / `room` (`supabase/migrations/20261001100000_chat_v2_rooms.sql:746-768`). On a database without it, a club room would be sent to the DM pane. Production and the local stack have it; a new room created by this build's room management must be written with `kind = 'room'` or it falls into the same hole.

---

## 6. Open questions for the planner, each with a recommended answer

**Q1. What is the desktop switch called and what does it mean?**
Recommend `chat_desktop`, with two server-only variables that copy the phone's rules exactly:
- `CHAT_DESKTOP_ENABLED`: exactly `true`, and only where `chatV2MayRunHere` says yes.
- `CHAT_DESKTOP_ALLOWLIST`: `*` for everyone or a comma list of user ids; blank is nobody.
- No clubs list. Nobody asked for one, and it would add a database read. (If Franky wants "SAE gets desktop too", add `CHAT_DESKTOP_CLUBS` later; the pattern is `flag.ts:90-98`.)
- The answer for a person: `desktop enabled AND (everyone OR listed) AND chatV2For(user)`. The last part is not optional (trap 5.9).
- Code: three pure readers in `src/lib/chat/flag.ts` beside the existing five (`chatDesktopEnabled`, `chatDesktopEveryone`, `chatDesktopListedUser`), tests added to `flag.test.ts` in the same style; `chatDesktopFor(userId)` in `flag-server.ts`; `FeaturesResponse` gains `chat_desktop: boolean`; `.env.example` gains a block under `:188`.
- This differs from the old note's `chat_v2_desktop` only in making "requires chat_v2" a rule of the function and not of how the lists are filled.

**Q2. How does the desktop page learn the answer: the client hook, or a prop from the server page?**
Recommend a prop. `page.tsx` computes `chatDesktopFor` after the gate and passes `desktopChat: boolean` to `MessagesSwitch`.
- Why: it is the only way a laptop with the switch OFF gets today's first paint. With a client hook the answer is unknown for one request, so the iframe could not be in the server's HTML and would start loading later than today, behind a skeleton. That breaks "with it off a laptop sees exactly what it sees today".
- Precedent: `campus/page.tsx:17` (`showSchoolVerifiedBanner`), `OnboardingSwitch`'s `boot` prop.
- Cost: the page needs the user's id. `enforceCampusAccess` returns nothing today (`campus-access.ts:19-49`). Recommend it returns `{ userId }` (additive; its six callers ignore the return) over a second `getUser()` round trip in the page.
- A stale prop is harmless here: it is a per-session switch, not what is open.
- Also put `chat_desktop` on `GET /api/me/features`, for the pieces that cannot take a prop (the static `messages.html` thread-only mode, `_miniMessenger.js`).
- Amend `.env.example:175` and contract 2.1 to say so (traps 5.17, 5.18).

**Q3. What renders before the client is known (trap 5.1)?**
Recommend: with `desktopChat` true, `MessagesSwitch` renders `CampusAppShell` + an empty stage in the page colour on the server and during hydration, then the phone tree or the desktop shell. One small store with a `false` server snapshot does it (`OnboardingSwitch.tsx:44-52` is the shape). With `desktopChat` false the function runs today's lines and nothing else. Optional on top: load `MessagesDesktop` with `next/dynamic` and `ssr: false` (allowed in a Client Component, lazy-loading.md:66-71) so phones and switch-off laptops never download it; the repo has no `next/dynamic` yet, so treat it as a nice-to-have, not the guard.

**Q4. What is one Back step on desktop?**
Recommend:
- Home -> open a chat: `pushState({ vibeChat: id, depth: 1 }, "", "/messages?channel=<id>")`.
- A click on another name in the slim list: `replaceState` (same mark, new id). So Back from any open chat is the home, not a replay of every chat visited.
- A room chip, event chips included: `replaceState` at depth 1.
- The "Messages" control: `history.back()` when the home's entry is underneath, else close in place with `replaceState(null, "", homeUrl(filter))` (the phone's `closeLayer` / `closeInPlace` logic, `MessagesMobile.tsx:300-331`, including the "nothing behind this entry" case of a pasted link).
- A dialog or the month popover: its own entry through `useLayerHistory`, so Back closes it first.
- A filter at home: `replaceState` to `homeUrl(filter)`.
- Back from a pasted `/messages?channel=<id>` leaves `/messages`, as on the phone (contract 2.3).

**Q5. Share the phone's open-state code or write a desktop twin?**
Recommend a twin (section 3). It reuses the tested helpers and edits no phone file. Merging the two is after-launch work.

**Q6. How does the DM pane switch threads (trap 5.3)?**
Recommend `key={threadId}` on the iframe for the first cut: no Back-history risk, no stale draft or menu from the previous thread (the phone keys its view the same way, `MessagesMobile.tsx:548-553`). If the walk shows the reload is slow, move to one iframe plus `postMessage`. The DM reader's map has the final word; the shell only needs the choice written in the contract.

**Q7. Is the right panel's open/closed state in the URL?**
Recommend no. Club panel: remembered per device in `localStorage`, shown by default. The DM "Pinned and Shared" panel: plain component state, closed every time a chat opens (design point 10 says hidden by default). A click on a pinned quote scrolls in place and writes nothing to the address.

**Q8. Campus > Chat with the switch on (design point 9): where is the redirect?**
Recommend on the server, in `src/app/campus/page.tsx`: after the gate, if `chatDesktopFor` is true and the URL carries `tab=chat` or `channel=`, `redirect("/messages" + (channel ? "?channel=<id>" : ""))`, dropping `org=` as the phone does (`CampusMobile.tsx:310`). It is right for both screens, because desktop-on implies `chat_v2` on and the phone already redirects those URLs. Pass the same boolean down `CampusSwitch` -> `CampusHome` so the Chat tab is not drawn. No 17,000-line client mount and no flash of the rails. With the switch off, `campus/page.tsx` renders exactly as today.

**Q9. Fix the lost query in `enforceCampusAccess("/messages")` (trap 5.12)?**
Recommend yes, in the same batch that edits `page.tsx`: pass `/messages` plus the `to` / `channel` / `tab` it was asked with. It only changes where a sign-in or Terms redirect returns to. It is the one change a switch-off account could meet, so list it in the contract's flag-off table; if the planner wants that table empty, leave it and log it as owed.

**Q10. A window dragged across 900px with a chat open?**
Recommend: accept the swap, as every other page does. The address says what is open, so the other tree opens the same chat. A draft is lost. Picking the layout once (the onboarding way) would leave a three-part page in a 600px window.

**Q11. Does the new page tell My Calendar about an RSVP (trap 5.15)?**
Recommend yes: the desktop RSVP dialog and the panel's RSVP button call `emitCalendarChanged()` after a successful write, and Your week refreshes on the same event. One line each, desktop tree only.

**Q12. A link to one message (for a pin jump or a mention)?**
Recommend not in this build. Pins jump inside the open chat. A `?m=<messageId>` parameter would need the thread read to page to that message, on both screens.

### 6.0 The recommended answers as one list: what the desktop shell does
1. Mounts only on the client, only at 900px or wider, only when the server said `desktopChat` (Q2, Q3).
2. On mount: `adoptLayerEntry()`; if it returns true, wait for the `popstate`. Else read `channelOfEntry(window.location.search, history.state)`; fall back to `initialChannelId` only if the address cannot be read. `?to=` counts only while the live address still carries it.
3. An id found: one `GET /api/me/threads/<id>/messages?limit=50`. `room` present -> the club pane on that room (its kind picks the chip; an event room selects its chip, no layer). No `room` -> the DM pane. Failure -> home, `replaceState(null, "", "/messages")`, a toast. Then `replaceState({ vibeChat: id, depth: 1 }, "", "/messages?channel=<id>")` on the entry already held.
4. One `popstate` handler: return on `isLayerPop(e)`; otherwise show what `channelOfEntry` says (a chat, or the home when null). Ignore pops that leave `/messages`.
5. Every history write inside `clearLayersThen` (or `clearLayersInto` when opening from the home with the month popover up).
6. Never `router.push` inside the page; never change the iframe's `src` in place; never let the iframe rewrite the top address.
7. Reads depth >= 1 as open; writes depth 1 only.
