# Map 04: direct messages and group chats on desktop today (`public/html/messages.html`)

Read Sat Oct 3, 2026 on branch `chat-desktop` (same as main). Read-only. Every line number is in the worktree copy of the file named.
Short names used below: **the page** = `public/html/messages.html` (3,755 lines). **The shell** = the new React desktop Messages. **Pane mode** = the thread-only mode this map designs.

## Short answer

- The page is one HTML file with one grid: its own left nav (hidden when framed), a 300px list column, and the conversation. All state is in two globals, `active` and `__realDM`.
- It already has a small bridge to its parent, but only for the coral cursor (`postMessage` with `source:'vibe-cursor'`). Nothing else is told to the parent. Navigation leaves the frame through `window.__vibeTopNav`.
- A chat can only be opened if it is in the page's own list (`__realDM.T`). So pane mode must keep loading the list as data, and only hide it.
- Pane mode is about 25 lines of CSS and 70 lines of JS in the page, all behind one class on `<html>` set from `?pane=1`. Without that flag the page is byte-for-byte what it does today.
- The service worker does not cache this page and `SW_VERSION` does not need a bump. The real risks are elsewhere: the iframe `src` changing (a reload plus a history entry), a double cursor under 760px of iframe width, the page's 2-second timer running while the frame is hidden, and the page only ever showing the last 50 messages (a pinned message older than that cannot be jumped to).

---

## 1. What exists

### 1.1 How the page is shown today

- `src/app/messages/page.tsx:26-37`: the server page. Gates with `enforceCampusAccess("/messages")`, reads `?to=` (lower-cased) and `?channel=` (trimmed), passes both to `MessagesSwitch`.
- `src/app/messages/MessagesSwitch.tsx:19-68`: `MessagesSwitch({ initialHandle?, initialChannelId? })`. Under 900px it renders the phone tree (`:28-37`). Otherwise it builds `/html/messages.html?app=1&embedded=1[&to=][&channel=]` (`:39-42`) and renders `CampusAppShell` with one `<iframe class="vibe-messages-iframe">` at `width:100%; height:100vh` (`:44-66`). It never reads a flag.
- The white-flash note: `MessagesSwitch.tsx:54-63`. The iframe element gets `background: var(--cream)` and `colorScheme: "normal"` so Chrome does not paint a white canvas in Night before the page loads.
- `src/components/campus-app-shell.tsx:33-51`: the 200px `LeftNav` + content grid. Otto's corner orb is not drawn on `/messages` (`:35`).
- `src/app/globals.css:2774-2778`: `.vibe-app-shell { grid-template-columns: 200px 1fr }`. `globals.css:3022-3034`: an under-760px rule for `.vibe-messages-iframe` (dead on desktop now that phones get the React tree).
- `src/proxy.ts:50`, `:251-299`: `/html/messages.html` is served only to a signed-in person and only with `?app=1`; without it the proxy redirects to `/messages`. Other query params pass through untouched, so a new `pane=1` needs no proxy change.
- `next.config.ts:85`: `X-Frame-Options: SAMEORIGIN` lets the app frame its own page.

### 1.2 The page's structure (DOM and CSS)

- Head: the theme boot script (`messages.html:4`), `_sw.js` (`:15`), then eight helper scripts (`:18-25`); `_persistence.js` is the only one loaded without `defer`.
- `.shell` (`:59`): `display:grid; grid-template-columns:200px 300px 1fr; height:100vh`. Children in order: `aside.left-nav` (`:972-1023`, the page's own nav and "My Calendar" widget), `div.thread-col` (`:1025-1065`, the list), `div.convo#convoPanel` (`:1067-1108`).
- Framed mode: `body.vibe-embedded .left-nav { display:none }` and `.shell { grid-template-columns:300px 1fr }` (`:29-30`). The class is put on `<body>` by `vibeInit()` when `?embedded=1` (`_persistence.js:112-127`), called as the first line of the page's init (`messages.html:3589`).
- List column: `.thread-col` (`:69`), header with title, "New" button and search (`:1026-1035`), the requests banner (`:1037-1041`), the requests header (`:1044-1047`), the tabs All / Unread / Connections (`:1048-1052`), the empty state `#tEmpty` (`:1054-1059`), the rows `#tScroll` (`:1060-1064`). Row CSS `:230-243`; the unread dot is `.t-item.unread::before` (`:233`).
- Conversation column: `.convo` (`:244`, `height:100vh`, flex column, `background:var(--paper)`; `:154` adds `position:relative; overflow:hidden`). Inside: `#emptyState` ("Pick someone to message", `:1068-1072`) and `#cContent` (`:1073-1107`) holding:
  - `.c-hdr` (`:1074-1082`, CSS `:245`): avatar `#cAv`, `#cName`, `#cStatus`, and `.c-actions` with two `.c-btn` buttons: profile (`:1079`) and the three-dot button that opens "Chat info" (`:1080`, `__dmPanelOpen()`).
  - `aside.c-panel#cPanel` (`:1083-1091`, CSS `:120-121`): "Chat info" / "Group info". It is `position:absolute; right:0; width:340px; max-width:80%` and slides OVER the thread. Filled by `__dmPanelRender()` (`:2986-3132`).
  - `#reqBar` (`:1093`): Accept / Decline for a message request.
  - `.msgs#msgsArea` (`:1094`, CSS `:266`): the scroller, padding `18px 22px`.
  - `.comp#compBox` (`:1095-1106`, CSS `:407-424`): staged media chip, paperclip, textarea `#msgIn` (Enter sends, `:1102`), send button, and `#compQuiet` (the "who can post" line).
- After the main script: the "New message" overlay `#composeOverlay` (`:3694-3718`, CSS `:82-117`, `position:fixed; inset:0`) and the old calendar modal (`:3721-3753`).
- Only one media query in the whole page: `@media (max-width:760px), (pointer:coarse)` (`:949-965`). It turns the native cursor back on and stacks the hover pill above the bubble.
- Bubbles: `.msg-row` (`:276`), mine is `flex-direction:row-reverse` (`:278`), so theirs sit at the left edge and mine at the right edge already. Width cap is `max-width:70%` of the row (`:301`), not a pixel cap.

### 1.3 Boot, query parameters, picking a chat

- State: `let active = null` (`:1150`, the open channel id) and `const __realDM = {...}` (`:1789-1828`): `T` (channel id -> thread record), `pollTimer`, `listTimer`, `POLL_MS:2000`, `LIST_POLL_MS:30000`, `TYPING_PING_MS:3000`, per-channel read / typing maps, list mode and query.
- Boot is the IIFE `initMessagesPage` (`:3587-3688`):
  1. `vibeInit()` (`:3589`), then `/api/me/profile-bootstrap` if the cached user is missing (`:3590-3616`); 401 and Terms go to the top window (`:3605-3612`).
  2. `__dmLoadConnections()` not awaited (`:3622`, up to 20 pages of `/api/me/connections`, `:2248-2268`), then `await __dmLoadList()` (`:3623`, `GET /api/me/threads`, `:2285-2321`).
  3. `?to=<handle>` (`:3626-3650`): `POST /api/me/threads {handle}` (`__dmEnsureFromHandle`, `:3574-3585`), reload the list, `openT(id)`, then REMOVE `to` from the TOP window's URL with `window.__vibeTopReplaceState` (`:3634-3639`).
  4. `?channel=<id>` (`:3653-3669`): if the id is in `__realDM.T`, `openT(id)` and REMOVE `channel` from the top URL (`:3663-3668`); if not, the empty state says "Couldn't open that conversation" (`:3654-3660`).
  5. Start the 30-second list timer (`:3671-3674`) and bind the @mention picker to `#msgIn` (`:3679-3687`).
- Query parameters read, in total: `app` (proxy only), `embedded`, `clear` (`_persistence.js:113-115`), `to`, `channel` (`messages.html:3625-3653`). Nothing else.
- Opening: `openT(id)` (`:1152-1159`) sets `active` and calls `__dmOpenChannel(id)` (`:2493-2580`). **`__dmOpenChannel` returns at once if `__realDM.T[id]` is missing (`:2494-2495`).** It clears the reply target, closes Chat info, moves the `.active` row class, paints the header from the thread record, paints the composer, loads messages, POSTs `/read` once (`:2573`), and restarts the 2-second timer (`:2575-2579`).
- Switching chats is already done without a reload: a row's `onclick="openT('<id>')"` (`:2114`).

### 1.4 Refresh, typing, Read, mentions, delete, attachments

- Thread timer: every 2 s, skipped when `document.hidden` (`:2576-2579`), calls `__dmLoadMessages(id, {fromPoll:true})` (`:2358-2491`) = `GET /api/me/threads/<id>/messages?limit=50` (`:2371-2374`). **No `before=`, no "load older": the page only ever shows the last 50 messages** (grep for `before=` in the page: none).
- List timer: every 30 s (`:3671-3674`). `__dmRenderList` (`:2124-2167`) rebuilds every row from the server answer and does NOT re-apply the `.active` class (only `__dmOpenChannel` sets it, `:2507-2514`).
- Read is marked once, when a chat is opened (`:2573`). A message that arrives while the chat is open is not marked read until the chat is reopened.
- Rendering: `renderMsgs(msgs, d)` (`:1281-1594`). Bubbles re-render only when a signature of message ids + reactions changes (`:1299-1305`); the footer (Delivered / Read + typing dots) re-renders every tick (`:1529-1580`). It keeps the scroll position unless the reader was within 80px of the bottom (`:1307-1309`, `:1589-1593`).
- "Read": 1:1 only, from `peer_last_read_at` (`:1532-1541`, `:2477`). Typing dots: from `peer_typing` (`:1545-1561`, `:2478`); the outgoing ping is `POST .../typing` at most every 3 s from `upd()` (`:1608-1623`).
- Hover pill: `actionsFor(m)` (`:1376-1401`) = five emoji, Reply (hidden where the viewer cannot post), Report (not on your own), Delete (your own only). Shown by a delegated hover with a 250 ms grace (`__dmInstallActionsHover`, `:1212-1258`). **Photo, video, shared-post and shared-profile rows get a Report-only pill, and your own such rows get no pill at all** (`reportPillFor` / `withReportPill`, `:1361-1371`, used at `:1456`, `:1494`, `:1509`).
- A message row carries no id in the DOM: `<div class="msg-row ...">` (`:1456`, `:1494`, `:1509`, `:1522`). Ids only appear inside `onclick` strings and on reaction chips.
- Delete your own: `__dmDeleteMessage` (`:3289-3307`) -> `DELETE /api/me/threads/<id>/messages/<mid>`, a hard delete for the sender (`src/app/api/me/threads/[id]/messages/[messageId]/route.ts:96-101`).
- Send: `snd()` (`:1596-1607`) -> `__dmSend` (`:2582-2672`): optional upload (`/api/me/messages-upload-url` then a PUT), `POST .../messages`, reload messages, scroll to the bottom, `__dmLoadList()`.
- @mention picker: `window.vibeBindMentionPicker(inp, { getChannelId: () => active })` (`:3679-3687`, `_mentionPicker.js:308`), a `position:fixed` popover inside the frame (`_mentionPicker.js:46`).
- "Chat info" actions (`:2986-3132`): View profile, **"Pin chat" / "Unpin chat"** (`:3080-3081` -> `__dmTogglePinCurrent`, `:3263-3283` -> `POST /api/me/threads/<id>/pin`, which pins the CONVERSATION to the top of your own list, `src/app/api/me/threads/[id]/pin/route.ts:8-12`), Mute, Report, Block, Leave group, Clear chat history, Delete conversation, and for groups the member list with Mute / Remove and rename / photo.

### 1.5 How the page talks to its parent today

- **Cursor bridge, the only `postMessage`.** `IS_EMBEDDED` = `window.self !== window.top` (`messages.html:1120`). When framed the page hides its own cursor and posts `{source:'vibe-cursor', type:'move'|'down'|'up'|'hover-on'|'hover-off', x, y}` to `window.parent` with target `'*'` (`:1121-1129`). The parent listens in `src/components/CustomCursor.tsx:138-163`: it filters on `d.source === "vibe-cursor"` and matches `e.source` to an `<iframe>`'s `contentWindow` (`:130-137`); it does not check `e.origin`.
- **No `addEventListener('message')` anywhere in the page** (grep: none). The parent cannot tell the page anything today.
- **Direct same-origin reach, three helpers in `_persistence.js`:** `window.__vibeTopNav(url, {replace})` sets `window.top.location` (`:135-146`); `window.__vibeTopReplaceState` calls `window.top.history.replaceState` (`:147-155`); `_vibeTopHere()` reads the top URL (`:161-167`). The page uses them at `messages.html:1058, 1079, 1965, 2295, 2299, 2562, 3077, 3605-3612, 3638, 3667`.
- **Theme.** The boot script (`:4`) sets `data-theme` on `<html>` before paint from `localStorage.vibe_theme`. `_persistence.js:96-107` re-applies it on a `storage` event (the frame shares `localStorage` with the shell, so a toggle in Settings reaches it) and on an OS change. Night values: `messages.html:48-49` (`--cream:#0C0B0B`, `--paper:#161515`). The drift test `src/lib/theme/theme.test.ts:236-258` requires the page's `<head>` to contain `THEME_BOOT_SCRIPT` verbatim.

### 1.6 The shared scripts the page loads (`messages.html:15-25`)

| File | What it gives the page | Note for pane mode |
|---|---|---|
| `_sw.js` (112) | registers `/sw.js` with `{scope:"/", updateViaCache:"none"}` (`:88`) | untouched |
| `_persistence.js` (744) | `vibeInit`, `vibeLoad/Save`, theme, `__vibeTopNav`, `vibeRequest`, `vibeToast` (`:318`), `vibeLoadFailed` (`:487`) | toasts render INSIDE the frame, bottom-centre of the frame (`:181-183`) |
| `_otto.js` (1,354) | Otto's corner and panel; hidden on this page by CSS (`messages.html:37`) but the script still runs and polls (`_otto.js:915-916`) | existing cost, leave |
| `_profilePreview.js` (253) | the shared-profile card in a bubble | untouched |
| `_postViewer.js` (2,137) | `window.openPostViewer(id)`: a `position:fixed` overlay inside the frame (`:27`, `:36-38`); **pushes a history entry in the frame** (`:682`) and closes on `popstate` (`:517`, `:801`) | see Traps |
| `_sharePicker.js` (374) | `window.openSharePicker` (lists `/api/me/threads`, `:228`) | untouched |
| `_safetyActions.js` (503) | `vibeBlock`, `vibeOpenMuteSheet`, `vibeOpenReportSheet`; overlays `position:fixed` in the frame, no dim (`:53-58`) | untouched |
| `_mentionPicker.js` (323) | `vibeBindMentionPicker` | untouched |
| `_imageCropper.js` (386) | `openImageCropper` for the group photo (`messages.html:3511-3515`) | untouched |

### 1.7 The chat bubble on the profile page (`public/html/_miniMessenger.js`, 1,055 lines)

- Loaded only by `public/html/profile.html:32`. Skips itself on `/html/messages.html` (`_miniMessenger.js:28-39`).
- Reads `GET /api/me/threads` with no scope for its badge (`:339-354`, every 30 s) and its list (`:446-451`, every 5 s while open); chat poll 2 s (`:607-610`).
- It treats only `type === "group"` as a group (`:510`, `:551`), so a club room (type `org_channel`) is drawn as a person with no peer: the audit's "random member's face" bug. Its "Expand" link is `/messages?to=<peer handle>` (`:580`), empty for a group or a club room.

### 1.8 How club rooms appear in the page's list today

- `GET /api/me/threads` with no `scope` returns dms, groups AND club rooms, but never event chats (`src/app/api/me/threads/route.ts:478-487`). `?scope=chats` returns dms and groups only, plus `requests` (`:408`, `:427`, `:487`).
- The page counts `org_channel` and `org_subchannel` as groups (`messages.html:2018`): group icon, "N people", the group "Chat info" with leave / rename / add / photo / delete removed for a room (`clubRoom`, `:2995`, `:3013-3019`, `:3043`, `:3108`, `:3116`).
- Each club entry carries `room_kind` and `can_post` (`route.ts:814-817`); the page keeps them (`messages.html:2052-2053`) and `__dmPaintComposer` (`:2343-2356`) swaps the composer for one quiet line when `canPost` is false: "Only officers post here." for a Board, "This chat is closed." otherwise (`:2351-2353`, copy table `:2326-2332`). A club room has no paperclip (`:424`).
- So today the page knows two "cannot post" reasons only. It has no notion of a room where only some members post, no lock mark, no megaphone, and no room list per club (each room is one flat row).

---

## 2. Reusable on desktop AS IS (and why it is safe)

- **The whole conversation column for dms and groups**: header, request bar, bubbles, hover pill, reactions, reply, typing dots, "Read", delete-your-own, paperclip upload, the @mention picker, the report / mute / block sheets, the shared-post viewer, "Chat info". All of it is driven by `active` + `__realDM.T[active]` and never looks at the list's DOM except to move the `.active` class (`:2507-2514`, harmless when the list is hidden).
- **`openT(id)`** (`:1152`) already switches chats in place with no reload and resets reply, panel, composer and timer. It is the one entry the bridge needs.
- **The list fetch as data.** `__dmLoadList()` fills `__realDM.T`, which the header and "Chat info" need (name, avatar, members, viewer role, peer handle). Keep it running; only its DOM is hidden.
- **The deep-link code** (`:3625-3669`) already opens `?channel=` and `?to=` on first load. Pane mode keeps it for the first open and only skips the two "remove the param from the top URL" lines.
- **Theme handling**: the boot script + the `storage` listener already follow the shell's Light / Night switch with no message needed.
- **The cursor bridge**: keeps working unchanged for a narrower frame, because the parent offsets by the frame's own rect (`CustomCursor.tsx:143-148`).
- **Navigation out of the frame** (`__vibeTopNav`): profile links, login and Terms bounces already leave the frame correctly.
- **Every route the page calls** (`/api/me/threads`, `.../messages`, `.../read`, `.../typing`, `.../pin`, `.../mute`, `.../clear`, `.../hide`, `.../accept`, `.../decline`, `.../members/...`, `/api/me/messages-upload-url`, `/api/me/group-photo-upload-url`, `/api/users/search`, `/api/me/reports`, `/api/me/block`): none checks the device or a flag for dms and groups.
- **The proxy and the frame header**: `?app=1&embedded=1&pane=1` passes `src/proxy.ts:293` as is; `X-Frame-Options: SAMEORIGIN` already allows it.

---

## 3. Phone-shaped or page-shaped: what must be wrapped, and the smallest way

The page is not phone-shaped; it is "whole-page-shaped": it assumes it owns the list, the URL and the window. Pane mode removes those three assumptions and nothing else.

### 3.1 The flag: one class on `<html>`, set from `?pane=1`

- The shell builds `/html/messages.html?app=1&embedded=1&pane=1[&channel=<id>|&to=<handle>]`. Today's `MessagesSwitch` branch keeps building the URL without `pane` (`MessagesSwitch.tsx:39-42`), so people without the switch load exactly today's page.
- New inline script in the head, on the blank line `messages.html:5` (right after the theme boot script, so it runs before first paint and before `<body>` exists):
  `<script>try{if(/[?&]pane=1(&|$)/.test(location.search))document.documentElement.classList.add('vibe-pane')}catch(e){}</script>`
  The theme drift test only needs the boot script to still be in the head verbatim (`theme.test.ts:243-257`), so a second script is safe.
- Why `<html>` and not `body.vibe-embedded`: the body class is added by `vibeInit()` at the END of the body (`messages.html:3589`), after the list column has been parsed; a class on `<html>` hides it from the first frame.

### 3.2 CSS: one new block after `messages.html:30` (about 12 rules, all prefixed `html.vibe-pane`)

| Rule | Why |
|---|---|
| `html.vibe-pane .left-nav, html.vibe-pane .thread-col { display:none !important; }` | no nav and no list of its own (`:60`, `:69`) |
| `html.vibe-pane .shell { grid-template-columns:1fr !important; }` | the thread takes the full frame (beats `:30` and `:59`) |
| `html.vibe-pane .convo { background:var(--cream); }` | the shell's stage is the page colour (`v2-tokens.ts` `page` = `--cream`), not `--paper` (`:244`) |
| `html.vibe-pane #emptyState > * { display:none; }` | the shell draws its own empty stage and its own "couldn't open" line; hides "Pick someone to message" while the frame loads (`:1068-1072`) |
| `html.vibe-pane .c-hdr, .msgs, .comp` padding to the shell's gutter | optional polish; today `15px 22px` / `18px 22px` / `12px 22px` (`:245`, `:266`, `:407`) |
| `html.vibe-pane .msg-row > div:not(.msg-av):not(.mv) { max-width:min(70%, 560px); }` | "bubbles capped": today the cap is 70% of the row (`:301`), which is 700px on a wide pane |
| `@media (max-width:760px) and (pointer:fine) { html.vibe-pane *, html.vibe-pane *::before, html.vibe-pane *::after { cursor:none !important; } html.vibe-pane input, html.vibe-pane textarea { cursor:text !important; } }` | undoes `:951-953` for a narrow frame on a laptop (see Trap 5.3) |
| `html.vibe-pane #cPinsBtn { display:flex; }` and the pin button / pinned-row highlight styles | point 10 |

Nothing outside `html.vibe-pane` selectors is edited.

### 3.3 JS: the spots to touch (path:line in `public/html/messages.html`)

1. **`:1120`**, after `IS_EMBEDDED`: `const IS_PANE = IS_EMBEDDED && document.documentElement.classList.contains('vibe-pane');` and a helper `__paneSay(type, extra)` that does `window.parent.postMessage(Object.assign({source:'vibe-dm', v:1, type}, extra||{}), location.origin)` inside try/catch and returns at once when `!IS_PANE`. Every call below goes through it, so with the flag off no message is ever sent.
2. **A new listener** (next to it): `window.addEventListener('message', ...)` that returns unless `IS_PANE && e.origin === location.origin && e.source === window.parent && e.data && e.data.source === 'vibe-shell'`. It handles the "shell to page" names in 3.4.
3. **`:2290`** `__dmLoadList`: in pane mode ask `/api/me/threads?scope=chats`, so the hidden list never holds a club room and a club room id fails cleanly instead of drawing in the old thread. Give the function an `opts.fromTimer`; after a good load (`:2304`) say `list-changed` unless `fromTimer`.
4. **`:2573`** `__dmOpenChannel`: turn the fire-and-forget `/read` into `.then(r => r.ok && __paneSay('read', {channelId}))`, and after it say `opened`. In pane mode also focus `#msgIn` here (today nothing focuses it).
5. **`:2488`** `__dmLoadMessages`: when the call is from the timer, the newest message id changed, and it is not mine, POST `/read` again (only while `!document.hidden`) and say `activity` then `read`. This also fixes the "dot comes back on the open chat" case for the slim list (see Trap 5.5).
6. **`:2653`** `__dmSend` success: say `activity {reason:'sent'}` (the `__dmLoadList()` there already yields `list-changed`).
7. **Chat closed by the page itself**: say `closed` at `:2787` (decline), `:3105` (block callback), `:3350` (delete conversation), `:3375` (leave group).
8. **`:3622`**: skip `__dmLoadConnections()` in pane mode (the Connections tab is hidden; it can cost up to 20 requests).
9. **`:3634-3639` and `:3663-3668`**: in pane mode do NOT strip `to` / `channel` from the top URL. The shell owns the URL; the deep link must stay `/messages?channel=<id>`.
10. **`:3645-3647` and `:3654-3660`**: also say `open-failed` (the copy "Pick one on the left" is hidden by the CSS above).
11. **`:3673`**: pass `{fromTimer:true}`. Keep the 30-second timer; it keeps names, members and roles fresh for the header and "Chat info".
12. **End of init, `:3687`**: say `ready` (after the list load and any deep link).
13. **For pins (point 10)**: add `data-mid="<id>"` to the four `.msg-row` templates (`:1456`, `:1494`, `:1509`, `:1522`); add the pin flag to the render signature (`:1299-1304`) or the pill will not flip between Pin and Unpin; add a Pin button to `actionsFor` (`:1400`) and to `reportPillFor` (`:1361-1364`), and give your OWN photo / post rows a pill (`withReportPill`, `:1368-1371`, returns the bare stack for your own today); a third `.c-btn#cPinsBtn` after `:1080`; and "Pinned" in `__dmPanelRender` is NOT needed on desktop if the shell draws the panel.

About 70 lines of JS. No existing line changes behaviour when `IS_PANE` is false.

### 3.4 The bridge: message names

All messages are plain objects. Page to shell: `{source:'vibe-dm', v:1, type, ...}` posted to `window.parent` with target origin `location.origin`. Shell to page: `{source:'vibe-shell', v:1, type, ...}` posted to `iframe.contentWindow` with target origin `window.location.origin`. Both sides check `e.origin === own origin` AND `e.source === the one expected window` AND `data.source`. The cursor bridge (`source:'vibe-cursor'`) stays as it is.

| Direction | `type` | Fields | When / what |
|---|---|---|---|
| page -> shell | `ready` | | the list is loaded and any `?channel=` / `?to=` has been tried; the shell may now send `open` |
| page -> shell | `opened` | `channelId`, `kind:'dm'|'group'`, `isRequest` | a chat finished opening (also after "New" or `?to=` created one) |
| page -> shell | `open-failed` | `channelId` or `handle`, `message` | not in the list after one reload, or the server refused |
| page -> shell | `read` | `channelId` | the `/read` POST answered ok: clear the dot |
| page -> shell | `activity` | `channelId`, `reason:'sent'|'received'` | a new message in the open chat: move the row up, refresh the preview |
| page -> shell | `list-changed` | | accept, decline, pin chat, mute, rename, photo, add, remove, leave, delete, block, new chat: refetch the inbox |
| page -> shell | `closed` | `channelId`, `reason` | the page closed the chat itself (decline, delete, leave, block): go home |
| page -> shell | `pins-toggle` | `channelId` | the header button was clicked |
| page -> shell | `pins-changed` | `channelId` | a Pin / Unpin from the hover pill succeeded: refetch the panel |
| shell -> page | `open` | `channelId` | calls `openT`; if the id is unknown, one `__dmLoadList()` then retry, then `open-failed` |
| shell -> page | `close` | | `active = null`, clear `pollTimer`, hide `#cContent`, close "Chat info": stops the 2-second timer when the shell goes home or opens a club |
| shell -> page | `jump` | `messageId` | scroll `[data-mid]` into view and flash it; answers `jump-missed` if it is not among the 50 loaded |
| shell -> page | `pins-changed` | `channelId` | an Unpin from the panel: refetch the pin set so the pill is right |
| shell -> page | `panel-state` | `open` | lets the page hide its header button while the panel shows (as in the picture) |
| page -> shell | `jump-missed` | `messageId` | see above |

Handshake: the shell treats the frame as not ready until `ready` with `v:1` arrives. No `ready` within about 8 seconds, or a different `v`, means an old or broken page: the shell shows one line with Retry (a reload of the frame). This is the guard against a stale file.

### 3.5 The shell side (new code, not in this area, listed so the contract can size it)

- A `LegacyThreadPane` component: ONE iframe, mounted once, its `src` frozen at mount (`useState(() => ...)`), never unmounted while the desktop Messages page lives; hidden with `visibility:hidden` or zero size (not `display:none`, see Trap 5.6) when a club is open or at home; `title="Messages"`; the same `background: var(--cream)` and `colorScheme: "normal"` style as `MessagesSwitch.tsx:57-63`.
- The message listener with the three checks, and a `send(type, extra)` helper that queues until `ready`.
- The Pinned and Shared panel as a React column to the right of the frame (the frame narrows; the page needs no layout work for it).

### 3.6 What stays untouched for people without the switch

- `MessagesSwitch.tsx:39-66` (the full-page iframe, its URL without `pane`).
- Every rule and line of the page outside `html.vibe-pane` / `IS_PANE`.
- `_miniMessenger.js`, `_persistence.js`, the other helpers, `public/sw.js`, `next.config.ts`, `src/proxy.ts`.

---

## 4. Contracts the desktop build must not break

1. **Flag off = today, byte for byte.** `MessagesSwitch.tsx:39-66` must still render one full-page iframe at `/html/messages.html?app=1&embedded=1[&to=][&channel=]`. No `pane` in that URL.
2. **The page's globals are an API for other files.** `openT`, `snd`, `upd`, `accReq`, `decReq`, `switchTab`, `filterT` and every `__dm*` function are called from inline `onclick` strings in the page's own markup (`:1029`, `:1034`, `:1045`, `:1049-1051`, `:1080`, `:1093`, `:1102-1103`, `:3694-3715`) and from HTML built in JS. Rename none.
3. **Theme head script.** `src/lib/theme/theme.test.ts:236-258`: the page's `<head>` must contain `THEME_BOOT_SCRIPT` verbatim. Add the pane script as a SECOND script; do not edit line 4.
4. **`_persistence.js` twins.** `src/lib/theme/theme.test.ts:266-275` (default theme and colours) and `src/lib/feedback/failure-copy.test.ts:107-118` (`NO_RETRY`, the "Try again" exception) read the file as text. Pane mode needs no edit there; keep it that way.
5. **Reaction emoji.** `src/lib/messages/reaction-emoji.test.ts:40-41` expects the hover pill's five emoji (`messages.html:1377`) to be on the allow-list. Adding a Pin button must not change that array.
6. **The proxy rule.** `/html/messages.html` is served only with `?app=1` to a signed-in person (`src/proxy.ts:50`, `:291-297`). The pane URL must keep `app=1`.
7. **Route shapes the page reads** (do not rename fields): `GET /api/me/threads` -> `{ok, threads[], requests[]}` with `id, type, name, peer{id,handle,name,avatar_url,school,bio}, members[], viewer_role, photo_url, last_message{content,created_at,media_kind,attachment_kind}, unread, pinned_at, muted_until, room_kind, can_post` (`messages.html:2017-2054`, `:2089-2098`). `GET .../messages?limit=50` -> `{ok, messages[], peer_last_read_at, peer_typing[], room, viewer{can_post}}` (`:2408-2486`; route `src/app/api/me/threads/[id]/messages/route.ts:169-170`, `:235-238`). A new per-message `pinned` field is additive and safe: the page copies named fields only (`:2453-2475`).
8. **Refusal copy has three hand-kept twins.** `REFUSAL_SENTENCES` in `src/lib/chat/types.ts`, `__DM_CHAT_REFUSALS` (`messages.html:2326-2332`) and `CHAT_REFUSALS` (`_miniMessenger.js:133-139`). No test ties them. A new refusal code for point 11 (a room where only some people post) must be added to all three, or the old desktop falls through to `alert('Could not send: ...')` (`messages.html:2669`).
9. **The "cannot post" line on the old page has two sentences only**, chosen by `roomKind === 'board'` (`messages.html:2351-2353`; same in `campus-home.tsx:16755-16756` and `ConversationView.tsx:1111-1112`). If point 11's rule is enforced by the database for everyone, a member who cannot post in an extra room would read "This chat is closed." on every OLD screen. Either the thread read sends the sentence and the old screens print it, or the contract accepts that line for people without the switch and says so.
10. **"Pin chat" already exists and means something else.** `POST /api/me/threads/[id]/pin` sets `channel_members.pinned_at` for the viewer only (`pin/route.ts:8-12`); the page's "Pin chat" / "Unpin chat" (`messages.html:3080-3081`) and the pin glyph on a list row (`:2108-2110`) use it, and the design's slim list ("pinned and unread chats") reads the same field. Message pins need different route names and different words ("Pin message", "Pinned").
11. **Service worker rules** (`public/sw.js:6-20`): bump `SW_VERSION` only when `sw.js` or `offline.html` change; both registrars must keep `{scope:"/", updateViaCache:"none"}`. This build edits neither, so no bump. `scripts/check-pwa.mjs:517-545` checks the static pages' head tags (manifest, theme-color, `_sw.js` with `defer`): leave those three lines alone.
12. **`X-Frame-Options: SAMEORIGIN`** (`next.config.ts:85`) must stay; `DENY` broke every frame once (`:77-84`).

### Cache and the service worker: what actually happens to an edited `messages.html`

- The worker caches ONE file, `/offline.html` (`sw.js:13`, `:27-28`). It only handles GET navigations, and answers them from the network (`sw.js:79-112`). A frame load is a navigation, so it passes through the worker and goes to the network; nothing is stored.
- `next.config.ts:64-125` sets no cache header for `/html/*`. Next serves `public/` files with `Cache-Control: public, max-age=0` (`node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/public-folder.md:30`), so the browser revalidates the page and the `_*.js` helpers on every load.
- So an old file can only be seen by a tab that was already open. The `ready` handshake with `v:1` (3.4) covers that case and any CDN surprise: no handshake, no pane. The Turbopack stale-CSS problem (`next.config.ts:24-31`) was about hashed `_next` files and does not apply to `public/`.
- Recommended and cheap: after the deploy, check the live file once with `curl -sI https://www.connectvibe.app/html/messages.html` (expect a redirect to login, proving the proxy path) and in a signed-in browser confirm `document.documentElement.classList.contains('vibe-pane')` inside the frame.

---

## 5. Traps

5.1 **A chat that is not in the page's list cannot open.** `__dmOpenChannel` returns silently when `__realDM.T[id]` is missing (`:2494-2495`). A chat created on another device after the frame loaded, a just-accepted request, or any id the shell knows and the page does not, will do nothing unless the `open` handler reloads the list first. Event chats are never in the list (`threads/route.ts:487`); with `?scope=chats` club rooms are not either, which is what we want: the shell must never send a club or event id to the frame.

5.2 **Never change the iframe's `src` after mount.** Every `src` change reloads nine scripts, the bootstrap and the list, flashes in Night, and adds an entry to the tab's back history. In React the `src` is easy to change by accident: `/messages?channel=` changes re-run `page.tsx`, which passes a new `initialChannelId`, and a `src` computed from props follows it. Freeze it at mount and switch chats only with `open`.

5.3 **Double cursor in a narrow frame.** The page's only media query, `(max-width:760px), (pointer:coarse)` (`:949-953`), turns the native cursor back on. Inside a frame "760px" is the FRAME's width. Today the frame is window minus 200, so this only bites between 900 and 960px. In the new shell the frame is window minus 200 minus the slim list (and minus the Pinned panel when open), so it bites on most laptops (any window under about 1,190px, or 1,480px with the panel open): the native arrow and the shell's coral cursor (`globals.css:1880-1885`, shown at 900px and up) both draw. The override in 3.2 fixes it.

5.4 **The 2-second timer does not stop when the frame is hidden.** The timer checks `document.hidden` (`:2577`), which follows the browser TAB, not the frame's own CSS. A frame hidden by the shell keeps asking for the last open chat every 2 s and can mark nothing. Send `close` whenever the shell leaves a dm (home, or a club opens). The 30-second list timer (`:3671-3674`) and Otto's poll (`_otto.js:915`) keep running too; in pane mode make the list timer return when `!active`.

5.5 **The unread dot comes back on the chat you are reading.** Read is marked once, on open (`:2573`). When the other person writes while the chat is open, the server's `unread` for it turns true again and the shell's inbox poll would put a coral dot on the highlighted row. Either the page marks read again on an incoming message (3.3 item 5, recommended; the phone's rooms do this in `src/lib/chat/use-room-poll.ts:238-269`, never while the tab is hidden) or the shell never draws a dot on the open row. Same family, old page: `__dmRenderList` drops the `.active` highlight every 30 s (`:2163-2165`); irrelevant in pane mode, the list is hidden.

5.6 **Scroll position and a hidden frame.** `renderMsgs` pins to the bottom by writing `a.scrollTop = a.scrollHeight` (`:1590`). If the frame has no layout at that moment (`display:none`), both are 0 and the thread opens scrolled to the TOP when shown. Hide the frame with `visibility:hidden` (it keeps its size), or show it before sending `open`. Also: the frame sets its own height from `100vh` (`:59`, `:244`), which is the frame's height, so the shell must give the frame a real height (the area under the "Your week" band), not `height:100vh` as `MessagesSwitch.tsx:52` does today.

5.7 **Focus and the keyboard.** A click on the slim list leaves keyboard focus in the shell; the page never focuses its composer on open. Fix: the shell calls `iframe.contentWindow.focus()` and the page focuses `#msgIn` in `open`. The reverse also bites: once focus is in the frame, the shell hears no `keydown` (Esc will not close the month popover or a dialog) and no `mousedown` (click-outside handlers never fire for a click inside the frame). Every shell popover must also close on the window's `blur` event, which fires when focus moves into the frame.

5.8 **White flash in Night.** Solved today by two style lines on the iframe element (`MessagesSwitch.tsx:54-63`); the new pane's iframe must carry the same two (`background: var(--cream)`, `colorScheme: "normal"`). Do not try to make the frame transparent: a frame whose document's colour scheme differs from the element's gets an opaque canvas (same comment). Mount the frame once at page load, hidden, so the first dm opens without a load.

5.9 **History entries made inside the frame.** `_postViewer.js:682` pushes an entry when a shared post opens and calls `history.back()` when it is closed by its X (`:801`). That is the TAB's joint history. If the shell also pushes entries (home -> chat), Back while a post is open closes the post first (good), but a shell `router.push` fired while the viewer is open would make the viewer's later `history.back()` undo the shell's step instead. Keep shell navigation to `replaceState` while a dm is open, or accept the edge. Also `__vibeTopReplaceState` rewrites the top URL behind Next's back (`_persistence.js:147-155`); pane mode skips those two calls (3.3 item 9) so `useSearchParams` and the address bar stay in step.

5.10 **Overlays live inside the frame.** "New message" (`:82`), the report / mute sheets (`_safetyActions.js:58`), the post viewer (`_postViewer.js:27`), the image cropper (`_imageCropper.js:24`), the @mention popover and every toast (`_persistence.js:181-183`) are `position:fixed` in the FRAME. In pane mode they centre in the conversation pane, not the window, and none can cover the slim list or the week band. Acceptable (they have no dim on purpose, `messages.html:77-82`), but the page's "New message" overlay cannot be used from the shell's home, where the frame is hidden: the shell's "New" needs the React compose (`src/components/mobile/messages/ComposeOverlay.tsx`) in a dialog, then `open`.

5.11 **Only the last 50 messages exist in the page.** `?limit=50` with no paging (`:2372`). A pinned message older than that cannot be scrolled to, and "Shared" cannot be built from what the page holds. `jump` must answer `jump-missed`, and the panel then shows the quote only (or the contract adds "load around a message" to the page, about 40 more lines and a `?before=` read; the route already takes `before`, `messages/route.ts:74`, `:108`).

5.12 **Message rows have no id in the DOM** (`:1456`, `:1494`, `:1509`, `:1522`) and the render skips work unless the id + reaction signature changes (`:1299-1305`). Jump needs `data-mid`; a pin flag must be part of the signature or the pill keeps saying "Pin" after pinning.

5.13 **Your own photos and shared posts have no hover pill at all** (`:1368-1371`), and other people's have Report only (`:1361-1364`). "Anyone can pin any message" needs a pill on those rows too. The pill's emoji must stay off them (the comment at `:1355-1360` explains why).

5.14 **Requests.** A pending request shows the Accept / Decline bar (`:2547-2554`) and the composer still works. Decide whether a pin is allowed before the request is accepted; the page knows the state as `d.isRequest`.

5.15 **`alert()` and `confirm()` are used for several actions** (`:2669`, `:3281`, `:3292`, `:3316`, `:3343`, `:3366`, `:3390`). They are native dialogs from a frame; they work, but look foreign next to the new shell. Not in scope; new pin code should use `vibeRequest` + `vibeToast` (`_persistence.js:174`, `:318`) like `__dmDeleteMessage` does (`:3293-3298`).

5.16 **The Mac's local stack and stale dev code.** The page is a static file: `next dev` serves edits at once, but an already-open tab keeps the old document inside a hot-reloaded shell. Reload the tab before judging a walk (the handshake line will say so).

---

## 6. Open questions for the planner (each with a recommended answer)

**Q1. Where does the "Pinned and Shared" panel live: inside the page, or in the React shell next to the frame?**
Recommend: the shell. The picture shows the thread getting narrower beside the panel; the page's only panel (`.c-panel`, `:120`) slides OVER the thread, so building it in the page means new layout code in vanilla JS. In the shell it reuses the club panel's column, tokens and Night handling, and the phone's "Pinned" list can share its data hook. The page then needs only: the header button, Pin in the hover pill, `data-mid`, and the `jump` handler.

**Q2. Does the page keep fetching its own list in pane mode?**
Recommend: yes, as `/api/me/threads?scope=chats` (`threads/route.ts:408`, not flag-gated), with the 30-second timer running only while a chat is open. The header and "Chat info" are painted from that record (`:2493-2570`, `:2986-3132`); feeding the record through the bridge instead would mean re-implementing `__dmThreadRecord` in the shell.

**Q3. Should the page mark the chat read again when a message arrives while it is open?**
Recommend: yes, in pane mode only, never while the tab is hidden. It keeps the slim list's dot right with no special case in the shell, and matches the phone's rooms. Flag-off behaviour stays as today.

**Q4. Mount the frame at page load, or on the first dm?**
Recommend: at page load, hidden, after the inbox's first paint. One frame for the life of the page, `src` frozen. Cost at home: one bootstrap check and one list read; no 2-second timer until `open`.

**Q5. Who handles `/messages?to=<handle>`?**
Recommend: on first load pass `to` in the frame's `src` as today; the page finds or creates the dm (`:3626-3631`) and says `opened {channelId}`; the shell then replaces the URL with `?channel=<id>`. After load, the shell's own "New message" creates the dm and sends `open`. No `open-handle` message needed.

**Q6. A pinned message older than the 50 the page holds: jump or not?**
Recommend for this build: no load-older. The page answers `jump-missed`, the panel keeps the quote readable in full, and the row says nothing happens rather than failing silently (one quiet line: "Earlier in this chat"). Adding "load around a message" is about 40 lines plus scroll-anchoring risk in a file we plan to retire. Say this plainly to Franky; on the phone the React view can do the real jump later.

**Q7. Does the old full-page Messages (switch off) get the Pin button?**
Recommend: no. The decided rule is "switch off = exactly today". Pin shows in pane mode only (`IS_PANE`). Pins made by others are simply not shown there.

**Q8. Route names for message pins, given `/api/me/threads/[id]/pin` is taken by "Pin chat"?**
Recommend: `GET /api/me/threads/[id]/pins` (the list for the panel, newest pin first) and `PUT` / `DELETE /api/me/threads/[id]/messages/[messageId]/pin`. Words: "Pin message" / "Unpin message" in menus, "Pinned" as the panel title, and leave "Pin chat" / "Unpin chat" as they are. Put a comment on both routes naming the other.

**Q9. The picture's hover toolbar is four icons (react, reply, pin, "..."); the page's is five emoji, "Reply", "Report", a bin. Restyle?**
Recommend: keep the page's pill and add one pin icon button to it. Restyling the pill is part of the React rebuild, which is NOT in this build. Tell Franky the dm toolbar will look like today's with a pin added.

**Q10. The chat bubble on the profile page (`_miniMessenger.js`) with the desktop switch on?**
Recommend: leave the file untouched in this build. It is a static file with no way to know the switch except a new `/api/me/features` read, and changing its list for everyone breaks "off = today". Its "Expand" link (`/messages?to=<handle>`, `:580`) keeps working through Q5. The "random member's face" bug (audit M3) stays a separate small fix.

**Q11. Point 11 on the OLD desktop page: a room where only some members can post.**
Recommend: two additive lines. (a) The thread read's `viewer` gains an optional sentence (who can post), and `__dmPaintComposer` (`:2351-2353`) prints it when present, else today's two sentences. (b) Any new refusal code is added to `__DM_CHAT_REFUSALS` (`:2326-2332`) and `CHAT_REFUSALS` (`_miniMessenger.js:133-139`). Without (a) an old-screen member reads "This chat is closed." in a room that is open; without (b) a refused send is a browser `alert`. Both are safe for people without the switch because the fields are absent until a club makes such a room. The lock mark, megaphone, room chips and room management are NOT added to the old page.

**Q12. What if `ready` never arrives?**
Recommend: after about 8 seconds the pane shows one line, "Couldn't open this chat. Retry", where Retry reloads the frame once. No automatic fall-back to the old full-page layout (two layouts in one session is worse than a retry line).

**Q13. `postMessage`, or direct same-origin calls like `iframe.contentWindow.openT(id)`?**
Recommend: `postMessage` both ways, as in 3.4. It keeps the shell from depending on the page's globals, is easy to fake in a test, and the origin + source checks cost three lines. The existing cursor bridge stays as it is (target `'*'`, matched by `e.source`, `CustomCursor.tsx:130-142`); tightening it is not part of this build.

**Q14. Can someone pin in a pending message request?**
Recommend: no. Hide Pin and the header button while `d.isRequest` (`:2547-2554`); the server refuses too (the pin rule requires an accepted member).

---

## Sizes, for the contract

- `public/html/messages.html`: about 12 CSS rules and about 70 JS lines, every one behind `html.vibe-pane` / `IS_PANE`; plus about 25 lines for Pin (button, `data-mid`, signature, jump). One file-owner batch.
- Shell: `LegacyThreadPane` (frame + bridge, about 150 lines) and the React Pinned and Shared panel.
- No edit to `public/sw.js`, `next.config.ts`, `src/proxy.ts`, `_persistence.js`, `_miniMessenger.js` (except Q11's refusal table, one line).
